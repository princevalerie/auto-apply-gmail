"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Loader2, Sparkles, Send, CheckCircle2, FileText, Cpu, Cloud, AlertTriangle, RefreshCw, Settings, Zap, Languages } from "lucide-react";
import { FileUploadZone, type SavedFileInfo } from "@/components/file-upload-zone";
import { ApplicationCard } from "@/components/application-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsPanel, getStoredApiKeys } from "@/components/settings-panel";
import { getStoredSelectedModel } from "@/components/model-selector";
import { toast } from "sonner";
import { cn, getMimeType, isValidEmail } from "@/lib/utils";

interface AIHealthStatus {
  gemini: { ok: boolean; models: number };
  groq: { ok: boolean; models: number };
  anyOk: boolean;
}

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
  const { data: session, status } = useSession();
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [cvFiles, setCvFiles] = useState<File[]>([]);
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [emailLanguage, setEmailLanguage] = useState<"id" | "en">("id");

  // AI Health Check
  const [aiStatus, setAiStatus] = useState<"loading" | "ok" | "failed">("loading");
  const [aiHealth, setAiHealth] = useState<AIHealthStatus | null>(null);
  const [settingsOpenFromGate, setSettingsOpenFromGate] = useState(false);

  // Cloud saved files
  const [savedCv, setSavedCv] = useState<SavedFileInfo | null>(null);
  const [savedPortfolio, setSavedPortfolio] = useState<SavedFileInfo | null>(null);
  const [isLoadingSavedFiles, setIsLoadingSavedFiles] = useState(false);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [isUploadingPortfolio, setIsUploadingPortfolio] = useState(false);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [sendStates, setSendStates] = useState<Record<number, SendState>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);

  // Fetch saved files from database on login/load
  const fetchSavedFiles = useCallback(async () => {
    try {
      setIsLoadingSavedFiles(true);
      const res = await fetch("/api/user/files");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSavedCv(json.data.cv);
          setSavedPortfolio(json.data.portfolio);
        }
      } else {
        console.warn("[Files] Failed to fetch saved files, status:", res.status);
      }
    } catch (err) {
      console.warn("Failed to fetch saved files:", err);
    } finally {
      setIsLoadingSavedFiles(false);
    }
  }, []);

  // AI Health Check function
  const checkAIHealth = useCallback(async () => {
    setAiStatus("loading");
    try {
      const keys = getStoredApiKeys();
      const params = new URLSearchParams();
      if (keys.geminiApiKey) params.set("geminiApiKey", keys.geminiApiKey);
      if (keys.groqApiKey) params.set("groqApiKey", keys.groqApiKey);

      const res = await fetch(`/api/ai/health?${params.toString()}`);
      if (!res.ok) {
        setAiStatus("failed");
        setAiHealth(null);
        return;
      }

      const data: AIHealthStatus = await res.json();
      setAiHealth(data);
      setAiStatus(data.anyOk ? "ok" : "failed");

      if (data.anyOk) {
        const providers: string[] = [];
        if (data.gemini.ok) providers.push(`Gemini (${data.gemini.models} models)`);
        if (data.groq.ok) providers.push(`Groq (${data.groq.models} models)`);
        console.log(`[AI Health] Connected: ${providers.join(", ")}`);
      }
    } catch (err) {
      console.error("[AI Health] Check failed:", err);
      setAiStatus("failed");
      setAiHealth(null);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSavedFiles();
      checkAIHealth();
    }
  }, [status, fetchSavedFiles, checkAIHealth]);

  const isCheckingCloudFiles = isLoadingSavedFiles || status === "loading";

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

  // Upload CV immediately to S3 & Database when selected (or overwritten)
  const handleCvChange = async (files: File[]) => {
    setCvFiles(files);
    if (files.length > 0) {
      const file = files[0];
      setIsUploadingCv(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", "cv");

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          toast.success(`CV "${file.name}" berhasil disimpan & diperbarui di cloud!`);
          await fetchSavedFiles();
          setCvFiles([]); // Clear local selection once synced
        } else {
          toast.error(json.error || "Gagal mengupload CV ke cloud");
        }
      } catch (err) {
        toast.error(`Error upload CV: ${(err as Error).message}`);
      } finally {
        setIsUploadingCv(false);
      }
    }
  };

  // Upload Portfolio immediately to S3 & Database when selected (or overwritten)
  const handlePortfolioChange = async (files: File[]) => {
    setPortfolioFiles(files);
    if (files.length > 0) {
      const file = files[0];
      setIsUploadingPortfolio(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", "portfolio");

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          toast.success(`Portfolio "${file.name}" berhasil disimpan & diperbarui di cloud!`);
          await fetchSavedFiles();
          setPortfolioFiles([]); // Clear local selection once synced
        } else {
          toast.error(json.error || "Gagal mengupload Portfolio ke cloud");
        }
      } catch (err) {
        toast.error(`Error upload Portfolio: ${(err as Error).message}`);
      } finally {
        setIsUploadingPortfolio(false);
      }
    }
  };

  // Delete saved file from Cloud
  const handleDeleteSavedFile = async (type: "cv" | "portfolio") => {
    try {
      const res = await fetch(`/api/user/files?type=${type}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (type === "cv") {
          setSavedCv(null);
          setCvFiles([]);
        } else {
          setSavedPortfolio(null);
          setPortfolioFiles([]);
        }
        toast.success(`${type === "cv" ? "CV" : "Portfolio"} berhasil dihapus dari cloud`);
      }
    } catch (err) {
      toast.error("Gagal menghapus file dari cloud");
    }
  };

  // Extract job info from all screenshots
  const handleExtract = async () => {
    if (screenshots.length === 0) {
      toast.error("Upload minimal 1 screenshot lowongan");
      return;
    }
    const hasCv = cvFiles.length > 0 || Boolean(savedCv);
    if (!hasCv) {
      toast.error("Upload CV terlebih dahulu");
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(0);
    setResults([]);
    setSendStates({});

    const extractedResults: ExtractionResult[] = [];
    
    // Prepare CV base64 if a local file was chosen
    const cvBase64 = cvFiles[0] ? await fileToBase64(cvFiles[0]) : undefined;
    if (!cvFiles[0] && savedCv) {
      toast.info(`Menggunakan CV di Cloud: ${savedCv.fileName}`);
    }

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
            language: emailLanguage,
            selectedModel: getStoredSelectedModel(),
            ...getStoredApiKeys(),
          }),
        });

        if (!res.ok) {
          let errorMsg = "Extraction failed";
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const errorJson = await res.json();
            errorMsg = errorJson.error || errorMsg;
          } else {
            const rawText = await res.text();
            errorMsg = rawText.slice(0, 100) || errorMsg;
          }
          throw new Error(errorMsg);
        }

        // Parse streaming response (heartbeat spaces + JSON at end)
        const rawText = await res.text();
        const data = JSON.parse(rawText.trim());
        
        if (data.error) {
          throw new Error(data.error);
        }

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
      // Send as FormData — portfolio as binary to avoid base64 bloat
      // CV is already cached server-side from /api/extract step
      // Only portfolio (~3.89MB binary) is sent here → well under Vercel's 4.5MB limit
      const formData = new FormData();
      formData.append("targetEmail", data.email);
      formData.append("emailSubject", data.emailSubject);
      formData.append("emailBody", data.emailBody);
      formData.append("position", data.position);
      formData.append("company", data.company);

      // Attach Portfolio as binary file (no base64 conversion needed!)
      if (portfolioFiles[0]) {
        formData.append("portfolio", portfolioFiles[0]);
      }

      const res = await fetch("/api/send", {
        method: "POST",
        body: formData, // No Content-Type header — browser sets multipart/form-data boundary
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        let errorMsg = "Gagal mengirim email";
        if (res.status === 413) {
          errorMsg = "Ukuran request terlalu besar.";
        } else if (contentType.includes("application/json")) {
          const errorJson = await res.json();
          errorMsg = errorJson.error || errorMsg;
        } else {
          const rawText = await res.text();
          errorMsg = rawText.slice(0, 200) || errorMsg;
        }
        throw new Error(errorMsg);
      }

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

  // ─── AI Health Check Loading State ─────────────────────
  if (aiStatus === "loading") {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/30 animate-pulse">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center gap-3 justify-center mb-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-lg font-semibold text-foreground">Memeriksa koneksi AI...</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Memverifikasi API key Gemini & Groq
          </p>
        </div>
      </div>
    );
  }

  // ─── AI Health Check Failed State ─────────────────────
  if (aiStatus === "failed") {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="card-elevated p-8 text-center">
            {/* Error Icon */}
            <div className="w-16 h-16 rounded-2xl bg-destructive/15 flex items-center justify-center mx-auto mb-6 border border-destructive/20">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-2">
              AI Tidak Terhubung
            </h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Tidak ada AI provider yang merespons. Pastikan API key Gemini atau Groq valid dan aktif.
            </p>

            {/* Provider Status */}
            {aiHealth && (
              <div className="space-y-2 mb-6">
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm ${
                  aiHealth.gemini.ok
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-destructive/10 border border-destructive/20"
                }`}>
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Gemini
                  </span>
                  <span className={`font-semibold ${aiHealth.gemini.ok ? "text-emerald-400" : "text-destructive"}`}>
                    {aiHealth.gemini.ok ? `✓ ${aiHealth.gemini.models} models` : "✕ Gagal"}
                  </span>
                </div>
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm ${
                  aiHealth.groq.ok
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-destructive/10 border border-destructive/20"
                }`}>
                  <span className="flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Groq
                  </span>
                  <span className={`font-semibold ${aiHealth.groq.ok ? "text-emerald-400" : "text-destructive"}`}>
                    {aiHealth.groq.ok ? `✓ ${aiHealth.groq.models} models` : "✕ Gagal"}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setSettingsOpenFromGate(true)}
                className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Buka API Settings
              </button>
              <button
                onClick={checkAIHealth}
                className="w-full py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary border border-border transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Coba Lagi
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Dapatkan API key gratis di{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aistudio.google.com</a>
            {" "}atau{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.groq.com</a>
          </p>
        </div>

        {/* Settings Panel (opened from gate) */}
        <SettingsPanel
          open={settingsOpenFromGate}
          onClose={() => setSettingsOpenFromGate(false)}
          onKeysUpdated={checkAIHealth}
        />
      </div>
    );
  }

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Dokumen Anda</h2>
                  <p className="text-xs text-muted-foreground">CV dan Portfolio (PDF)</p>
                </div>
              </div>

              {savedCv && !isCheckingCloudFiles && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  CV Siap
                </span>
              )}
            </div>

            <FileUploadZone
              accept="application/pdf"
              multiple={false}
              maxFiles={1}
              label="Upload CV (Wajib)"
              description="PDF — Maksimal 10MB"
              icon="pdf"
              files={cvFiles}
              onFilesChange={handleCvChange}
              disabled={isExtracting}
              savedFile={savedCv}
              onDeleteSavedFile={() => handleDeleteSavedFile("cv")}
              isUploading={isUploadingCv}
              isLoading={isCheckingCloudFiles}
            />

            <FileUploadZone
              accept="application/pdf"
              multiple={false}
              maxFiles={1}
              label="Upload Portfolio (Opsional)"
              description="PDF — Maksimal 10MB"
              icon="pdf"
              files={portfolioFiles}
              onFilesChange={handlePortfolioChange}
              disabled={isExtracting}
              savedFile={savedPortfolio}
              onDeleteSavedFile={() => handleDeleteSavedFile("portfolio")}
              isUploading={isUploadingPortfolio}
              isLoading={isCheckingCloudFiles}
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

            {/* Language Selector Mode */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border mt-4">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-primary" />
                Bahasa Email:
              </span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-background border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setEmailLanguage("id")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-all",
                    emailLanguage === "id"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🇮🇩 Indonesia
                </button>
                <button
                  type="button"
                  onClick={() => setEmailLanguage("en")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-medium transition-all",
                    emailLanguage === "en"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🇬🇧 English
                </button>
              </div>
            </div>

            {/* Extract button */}
            {screenshots.length > 0 && (cvFiles.length > 0 || savedCv) && !isExtracting && (
              <button
                onClick={handleExtract}
                className="btn-primary w-full mt-4 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 group"
              >
                <Sparkles className="w-4 h-4" />
                Proses {screenshots.length} Screenshot ({emailLanguage === "id" ? "Bahasa Indonesia" : "English"})
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
