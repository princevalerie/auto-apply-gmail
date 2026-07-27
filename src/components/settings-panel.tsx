"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Key, Save, CheckCircle2, AlertTriangle, Sparkles, Cpu } from "lucide-react";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY_GEMINI = "autoapply_gemini_key";
const STORAGE_KEY_GROQ = "autoapply_groq_key";

export function getStoredApiKeys() {
  if (typeof window === "undefined") return { geminiApiKey: "", groqApiKey: "" };
  return {
    geminiApiKey: localStorage.getItem(STORAGE_KEY_GEMINI) || "",
    groqApiKey: localStorage.getItem(STORAGE_KEY_GROQ) || "",
  };
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      const keys = getStoredApiKeys();
      setGeminiKey(keys.geminiApiKey);
      setGroqKey(keys.groqApiKey);
      setSaved(false);
    }
  }, [open]);

  const handleSave = () => {
    if (geminiKey.trim()) {
      localStorage.setItem(STORAGE_KEY_GEMINI, geminiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_GEMINI);
    }
    if (groqKey.trim()) {
      localStorage.setItem(STORAGE_KEY_GROQ, groqKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_GROQ);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const maskKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 8) return "••••••••";
    return "••••••••" + key.slice(-4);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="settings-panel pointer-events-auto w-full max-w-lg animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="settings-panel-header">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <Key className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">API Keys</h2>
                <p className="text-xs text-muted-foreground">
                  Override keys tanpa redeploy
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="settings-panel-body">
            {/* Info Banner */}
            <div className="settings-info-banner">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Override keys akan digunakan sebagai pengganti environment variable server.
                Kosongkan untuk menggunakan default. Keys disimpan di browser (localStorage).
              </p>
            </div>

            {/* Gemini API Key */}
            <div className="settings-field-group">
              <label className="settings-label">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Gemini API Key</span>
                </div>
                {geminiKey && (
                  <span className="settings-badge-active">
                    <CheckCircle2 className="w-3 h-3" />
                    Aktif
                  </span>
                )}
              </label>
              <div className="settings-input-wrapper">
                <input
                  type={showGemini ? "text" : "password"}
                  value={showGemini ? geminiKey : (geminiKey ? maskKey(geminiKey) : "")}
                  onChange={(e) => {
                    setShowGemini(true);
                    setGeminiKey(e.target.value);
                  }}
                  onFocus={() => setShowGemini(true)}
                  placeholder="AIzaSy..."
                  className="settings-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowGemini(!showGemini)}
                  className="settings-input-toggle"
                >
                  {showGemini ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Primary AI provider. Dapatkan di{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  aistudio.google.com
                </a>
              </p>
            </div>

            {/* Groq API Key */}
            <div className="settings-field-group">
              <label className="settings-label">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-accent" />
                  <span>Groq API Key</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-medium">
                    FALLBACK
                  </span>
                </div>
                {groqKey && (
                  <span className="settings-badge-active">
                    <CheckCircle2 className="w-3 h-3" />
                    Aktif
                  </span>
                )}
              </label>
              <div className="settings-input-wrapper">
                <input
                  type={showGroq ? "text" : "password"}
                  value={showGroq ? groqKey : (groqKey ? maskKey(groqKey) : "")}
                  onChange={(e) => {
                    setShowGroq(true);
                    setGroqKey(e.target.value);
                  }}
                  onFocus={() => setShowGroq(true)}
                  placeholder="gsk_..."
                  className="settings-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowGroq(!showGroq)}
                  className="settings-input-toggle"
                >
                  {showGroq ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Fallback saat Gemini kena limit. Dapatkan di{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  console.groq.com
                </a>
              </p>
            </div>

            {/* Fallback Flow Info */}
            <div className="settings-flow-info">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-2">
                <span>Alur Fallback</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="settings-flow-node settings-flow-gemini">
                  <Sparkles className="w-3 h-3" />
                  Gemini
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="text-[10px] text-muted-foreground italic">jika gagal</span>
                <span className="text-muted-foreground">→</span>
                <span className="settings-flow-node settings-flow-groq">
                  <Cpu className="w-3 h-3" />
                  Groq
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="settings-panel-footer">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className={`btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                saved ? "!bg-green-600 !shadow-green-600/25" : ""
              }`}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Tersimpan!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Simpan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
