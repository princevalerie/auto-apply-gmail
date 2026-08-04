"use client";

import {
  Building2,
  MapPin,
  Mail,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  Edit3,
} from "lucide-react";
import { cn, isValidEmail } from "@/lib/utils";

interface ApplicationData {
  position: string;
  company: string;
  email: string;
  location: string;
  requirements: string[];
  emailSubject: string;
  emailBody: string;
  emailValid: boolean;
  warning?: string | null;
  screenshotUrl?: string;
  screenshotPreview?: string;
}

interface ApplicationCardProps {
  data: ApplicationData;
  index: number;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSend: () => void;
  sending?: boolean;
  sent?: boolean;
  error?: string;
}

export function ApplicationCard({
  data,
  index,
  onSubjectChange,
  onBodyChange,
  onEmailChange,
  onSend,
  sending = false,
  sent = false,
  error,
}: ApplicationCardProps) {
  const emailIsValid = isValidEmail(data.email);
  const emailIsEmpty = !data.email || data.email.trim() === "";
  const isFailed = data.position === "Gagal diproses";

  return (
    <div
      className={cn(
        "card-elevated p-6 animate-slide-up",
        sent && "border-success/30 bg-success/5",
        error && "border-destructive/30 bg-destructive/5"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        {/* Screenshot thumbnail */}
        {data.screenshotPreview && (
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted flex-shrink-0 border border-border">
            <img
              src={data.screenshotPreview}
              alt="Screenshot"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-primary flex-shrink-0" />
            <h3 className="text-base font-semibold truncate">
              {data.position || "Posisi tidak terdeteksi"}
            </h3>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {data.company || "Perusahaan tidak terdeteksi"}
            </span>
            {data.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {data.location}
              </span>
            )}
          </div>

          {/* Status badge */}
          <div className="mt-2">
            {sent ? (
              <span className="badge badge-sent">
                <CheckCircle2 className="w-3 h-3" /> Terkirim
              </span>
            ) : error ? (
              <span className="badge badge-failed">
                <AlertTriangle className="w-3 h-3" /> Gagal
              </span>
            ) : emailIsEmpty ? (
              <span className="badge badge-warning">
                <Edit3 className="w-3 h-3" /> Ketik email manual
              </span>
            ) : !emailIsValid ? (
              <span className="badge badge-warning">
                <AlertTriangle className="w-3 h-3" /> Format email salah
              </span>
            ) : (
              <span className="badge badge-draft">Siap kirim</span>
            )}
          </div>
        </div>
      </div>

      {/* Warning/Error from extraction */}
      {data.warning && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
          {data.warning}
        </div>
      )}

      {/* Requirements */}
      {data.requirements && data.requirements.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Requirements
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.requirements.map((req, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs rounded-lg bg-secondary text-secondary-foreground"
              >
                {req}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Email Target */}
      <div className="mb-4">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
          <Mail className="w-3 h-3" />
          Email Tujuan
        </label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => onEmailChange(e.target.value)}
          className={cn(
            "w-full px-4 py-2.5 rounded-xl bg-input border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
            emailIsValid ? "border-border" : "border-warning/50"
          )}
          placeholder={emailIsEmpty ? "Email tidak terdeteksi — ketik manual di sini" : "email@company.com"}
          disabled={sent || sending}
        />
        {emailIsEmpty && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Edit3 className="w-3 h-3" />
            Email tidak terdeteksi dari screenshot. Silakan ketik alamat email tujuan.
          </p>
        )}
        {!emailIsValid && !emailIsEmpty && (
          <p className="text-xs text-warning mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Format email tidak valid
          </p>
        )}
      </div>

      {/* Subject */}
      <div className="mb-4">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block uppercase tracking-wider">
          Subject Email
        </label>
        <input
          type="text"
          value={data.emailSubject}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
          disabled={sent || sending}
        />
      </div>

      {/* Body */}
      <div className="mb-5">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block uppercase tracking-wider">
          Isi Email
        </label>
        <textarea
          value={data.emailBody}
          onChange={(e) => onBodyChange(e.target.value)}
          rows={8}
          className="w-full px-4 py-3 rounded-xl bg-input border border-border text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
          disabled={sent || sending}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Send button */}
      {!sent && (
        <button
          onClick={onSend}
          disabled={!emailIsValid || sending}
          className={cn(
            "btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          )}
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Mengirim...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Kirim Email
            </>
          )}
        </button>
      )}
    </div>
  );
}
