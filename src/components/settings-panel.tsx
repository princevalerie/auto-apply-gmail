"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Key, Save, CheckCircle2, AlertTriangle, Sparkles, Cpu, Loader2, Wifi } from "lucide-react";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onKeysUpdated?: () => void;
}

interface TestResult {
  gemini: { ok: boolean; models: number };
  groq: { ok: boolean; models: number };
  anyOk: boolean;
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

export function SettingsPanel({ open, onClose, onKeysUpdated }: SettingsPanelProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (open) {
      const keys = getStoredApiKeys();
      setGeminiKey(keys.geminiApiKey);
      setGroqKey(keys.groqApiKey);
      setSaved(false);
      setTestResult(null);
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
    // Notify parent to re-check AI health
    onKeysUpdated?.();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Use current input values (not yet saved) for testing
      const params = new URLSearchParams();
      if (geminiKey.trim()) params.set("geminiApiKey", geminiKey.trim());
      if (groqKey.trim()) params.set("groqApiKey", groqKey.trim());

      const res = await fetch(`/api/ai/health?${params.toString()}`);
      if (res.ok) {
        const data: TestResult = await res.json();
        setTestResult(data);
      } else {
        setTestResult({ gemini: { ok: false, models: 0 }, groq: { ok: false, models: 0 }, anyOk: false });
      }
    } catch {
      setTestResult({ gemini: { ok: false, models: 0 }, groq: { ok: false, models: 0 }, anyOk: false });
    } finally {
      setTesting(false);
    }
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

            {/* Test Connection */}
            <div className="pt-2">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="w-full py-2.5 rounded-xl text-sm font-medium border border-border hover:bg-secondary transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengecek koneksi...
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4" />
                    Test Koneksi
                  </>
                )}
              </button>

              {/* Test Results */}
              {testResult && (
                <div className="mt-3 space-y-1.5 animate-fade-in">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                    testResult.gemini.ok
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-destructive/10 border border-destructive/20 text-destructive"
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />
                      Gemini
                    </span>
                    <span className="font-semibold">
                      {testResult.gemini.ok ? `✓ ${testResult.gemini.models} models` : "✕ Gagal"}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                    testResult.groq.ok
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-destructive/10 border border-destructive/20 text-destructive"
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3 h-3" />
                      Groq
                    </span>
                    <span className="font-semibold">
                      {testResult.groq.ok ? `✓ ${testResult.groq.models} models` : "✕ Gagal"}
                    </span>
                  </div>
                  <p className={`text-[11px] text-center mt-2 font-medium ${
                    testResult.anyOk ? "text-emerald-400" : "text-destructive"
                  }`}>
                    {testResult.anyOk ? "✓ Minimal 1 provider terhubung — siap digunakan!" : "✕ Semua provider gagal — periksa API key"}
                  </p>
                </div>
              )}
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
