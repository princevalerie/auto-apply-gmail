"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Loader2, Sparkles, Send, CheckCircle2, FileText, Cpu } from "lucide-react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ApplicationCard } from "@/components/application-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { getMimeType, isValidEmail } from "@/lib/utils";
import { getStoredApiKeys } from "@/components/settings-panel";

export interface ExtractionResult {
  position: string;
  company: string;
  email: string;
  location: string;
  requirements: string[];
  emailSubject: string;
  emailBody: string;
  emailValid: boolean;
  warning: string | null;
  screenshotPreview: string;
  extractProvider?: "gemini" | "groq";
  emailProvider?: "gemini" | "groq";
}

interface SendState {
  sending: boolean;
  sent: boolean;
  error?: string;
}

export default function Home() {
  const { data: session } = useSession();
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [cvFiles, setCvFiles] = useState<File[]>([]);
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [sendStates, setSendStates] = useState<Record<number, SendState>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Extract job info from all screenshots
  const handleExtract = async () => {
    if (screenshots.length === 0) {
      toast.error("Upload minimal 1 screenshot lowongan");
      return;
    }
    if (cvFiles.length === 0) {
      toast.error("CV wajib diupload");
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(0);
    setResults([]);
    setSendStates({});

    const extractedResults: ExtractionResult[] = [];
    
    // Prepare CV and Portfolio base64 once
    const cvBase64 = cvFiles[0] ? await fileToBase64(cvFiles[0]) : undefined;
    const portfolioBase64 = portfolioFiles[0] ? await fileToBase64(portfolioFiles[0]) : undefined;

    for (let i = 0; i < screenshots.length; i++) {
      try {
        const file = screenshots[i];
        const base64 = await fileToBase64(file);
        const mimeType = getMimeType(file.name);

        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            imageBase64: base64, 
            mimeType,
            cvBase64,
            portfolioBase64,
            ...getStoredApiKeys(),
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Extraction failed");
        }

        const data = await res.json();
        extractedResults.push({
          ...data.data,
          screenshotPreview: URL.createObjectURL(file),
        });

        setExtractionProgress(((i + 1) / screenshots.length) * 100);
      } catch (error) {
        const errMsg = (error as Error).message;
        toast.error(`Gagal memproses screenshot ${i + 1}: ${errMsg}`);
        extractedResults.push({
          position: "Gagal diproses",
          company: "N/A",
          email: "",
          location: "",
          requirements: [],
          emailSubject: "",
          emailBody: "",
          emailValid: false,
          warning: `Error: ${errMsg}`,
          screenshotPreview: URL.createObjectURL(screenshots[i]),
        });
      }
    }

    setResults(extractedResults);
    setIsExtracting(false);
    toast.success(`${extractedResults.length} lowongan berhasil diproses!`);
  };

  const updateResult = (index: number, field: string, value: string) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const sendSingle = async (index: number) => {
    const data = results[index];
    if (!isValidEmail(data.email)) {
      toast.error("Email tujuan tidak valid");
      return;
    }

    setSendStates((prev) => ({
      ...prev,
      [index]: { sending: true, sent: false },
    }));

    try {
      const cvBase64 = cvFiles[0] ? await fileToBase64(cvFiles[0]) : undefined;
      const portfolioBase64 = portfolioFiles[0] ? await fileToBase64(portfolioFiles[0]) : undefined;

      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: data.email,
          emailSubject: data.emailSubject,
          emailBody: data.emailBody,
          cvBase64,
          portfolioBase64
        }),
      });

      const result = await res.json();

      if (result.success) {
        setSendStates((prev) => ({
          ...prev,
          [index]: { sending: false, sent: true },
        }));
        toast.success(`Email ke ${data.company} berhasil terkirim!`);
      } else {
        setSendStates((prev) => ({
          ...prev,
          [index]: { sending: false, sent: false, error: result.error },
        }));
        toast.error(`Gagal mengirim ke ${data.company}: ${result.error}`);
      }
    } catch (error) {
      setSendStates((prev) => ({
        ...prev,
        [index]: { sending: false, sent: false, error: (error as Error).message },
      }));
      toast.error(`Gagal mengirim: ${(error as Error).message}`);
    }
  };

  const sendAll = async () => {
    setSendingAll(true);
    const validIndices = results
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => isValidEmail(r.email) && !sendStates[i]?.sent && !sendStates[i]?.sending)
      .map(({ i }) => i);

    for (const index of validIndices) {
      await sendSingle(index);
    }

    setSendingAll(false);
    toast.success("Semua email selesai diproses!");
  };

  const validCount = results.filter((r) => isValidEmail(r.email)).length;
  const sentCount = Object.values(sendStates).filter((s) => s.sent).length;
  const allSent = sentCount === results.length && results.length > 0;

  return (
    <div className="min-h-screen bg-gradient-mesh pb-20">
      <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-8">
        
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-2xl lg:text-3xl font-bold">
            Selamat datang,{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {session?.user?.name?.split(" ")[0] || "User"}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload dokumen dan screenshot lowongan kerja untuk memulai
          </p>
        </div>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
          
          {/* Document Uploads */}
          <div className="card-elevated p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Dokumen Anda</h2>
                <p className="text-xs text-muted-foreground">Upload CV dan Portfolio (PDF)</p>
              </div>
            </div>

            <FileUploadZone
              accept="application/pdf"
              multiple={false}
              maxFiles={1}
              label="Upload CV (Wajib)"
              description="PDF — Maksimal 10MB"
              icon="pdf"
              files={cvFiles}
              onFilesChange={setCvFiles}
              disabled={isExtracting}
            />

            <FileUploadZone
              accept="application/pdf"
              multiple={false}
              maxFiles={1}
              label="Upload Portfolio (Opsional)"
              description="PDF — Maksimal 10MB"
              icon="pdf"
              files={portfolioFiles}
              onFilesChange={setPortfolioFiles}
              disabled={isExtracting}
            />
          </div>

          {/* Screenshot Uploads */}
          <div className="card-elevated p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Lowongan</h2>
                <p className="text-xs text-muted-foreground">Upload screenshot loker (Batch)</p>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <FileUploadZone
                accept="image/png,image/jpeg,image/jpg,image/webp"
                multiple={true}
                maxFiles={10}
                label="Drop screenshot di sini"
                description="PNG, JPG, WebP — Max 10 file"
                icon="image"
                files={screenshots}
                onFilesChange={setScreenshots}
                disabled={isExtracting}
              />
            </div>

            {/* Extract button */}
            {screenshots.length > 0 && cvFiles.length > 0 && !isExtracting && (
              <button
                onClick={handleExtract}
                className="btn-primary w-full mt-6 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 group"
              >
                <Sparkles className="w-4 h-4" />
                Proses {screenshots.length} Screenshot
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            )}

            {/* Progress bar */}
            {isExtracting && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Menganalisis dengan AI...
                  </span>
                  <span className="text-primary font-medium">{Math.round(extractionProgress)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                    style={{ width: `${extractionProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results / Preview Section */}
        {results.length > 0 && (
          <div className="animate-slide-up pt-8 border-t border-border" style={{ animationDelay: "200ms" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold">Hasil Ekstraksi & Preview</h2>
                <p className="text-sm text-muted-foreground">
                  {results.length} lowongan · {validCount} email valid · {sentCount} terkirim
                </p>
                {/* Provider badges */}
                {results.length > 0 && results[0].extractProvider && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      results[0].extractProvider === "gemini"
                        ? "bg-primary/15 text-primary border border-primary/20"
                        : "bg-accent/15 text-accent border border-accent/20"
                    }`}>
                      {results[0].extractProvider === "gemini" ? (
                        <Sparkles className="w-2.5 h-2.5" />
                      ) : (
                        <Cpu className="w-2.5 h-2.5" />
                      )}
                      {results[0].extractProvider === "gemini" ? "Gemini" : "Groq"}
                    </span>
                  </div>
                )}
              </div>

              {/* Send All Button */}
              {!allSent && validCount > 0 && (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={sendingAll}
                  className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 self-start sm:self-auto"
                >
                  {sendingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Kirim Semua ({validCount - sentCount})
                    </>
                  )}
                </button>
              )}

              {allSent && (
                <div className="flex items-center gap-2 text-success text-sm font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Semua terkirim!
                </div>
              )}
            </div>

            {/* Application Cards */}
            <div className="space-y-6">
              {results.map((result, index) => (
                <ApplicationCard
                  key={index}
                  data={result}
                  index={index}
                  onSubjectChange={(v) => updateResult(index, "emailSubject", v)}
                  onBodyChange={(v) => updateResult(index, "emailBody", v)}
                  onEmailChange={(v) => updateResult(index, "email", v)}
                  onSend={() => sendSingle(index)}
                  sending={sendStates[index]?.sending}
                  sent={sendStates[index]?.sent}
                  error={sendStates[index]?.error}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={sendAll}
        title="Kirim Semua Email?"
        message={`Kamu akan mengirim ${validCount - sentCount} email lamaran sekaligus. Pastikan subject dan body sudah sesuai.`}
        confirmText="Ya, Kirim Semua"
        cancelText="Batal"
      />
    </div>
  );
}
