"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Sparkles, Cpu, Loader2, Brain } from "lucide-react";
import { getStoredApiKeys } from "@/components/settings-panel";
import { cn } from "@/lib/utils";

const STORAGE_KEY_MODEL = "autoapply_selected_model";

export interface SelectedModel {
  provider: "gemini" | "groq";
  modelId: string;
}

export function getStoredSelectedModel(): SelectedModel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODEL);
    if (!raw) return null;
    return JSON.parse(raw) as SelectedModel;
  } catch {
    return null;
  }
}

function getModelDisplayName(modelId: string): string {
  // Clean up common prefixes for display
  let name = modelId
    .replace("models/", "")
    .replace("meta-llama/", "");
  
  // Capitalize and beautify
  if (name.startsWith("gemini-")) {
    const parts = name.replace("gemini-", "").split("-");
    const version = parts[0];
    const variant = parts.slice(1).join(" ");
    return `Gemini ${version} ${variant.charAt(0).toUpperCase() + variant.slice(1)}`.trim();
  }
  
  if (name.startsWith("llama-")) {
    return name
      .split("-")
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  return name;
}

interface ModelSelectorProps {
  onModelChange?: (model: SelectedModel | null) => void;
}

export function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const [groqModels, setGroqModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load saved selection
  useEffect(() => {
    const saved = getStoredSelectedModel();
    if (saved) {
      setSelectedModel(saved);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchModels = useCallback(async () => {
    if (hasFetched) return;
    setLoading(true);
    try {
      const keys = getStoredApiKeys();
      const params = new URLSearchParams();
      if (keys.geminiApiKey) params.set("geminiApiKey", keys.geminiApiKey);
      if (keys.groqApiKey) params.set("groqApiKey", keys.groqApiKey);

      const res = await fetch(`/api/ai/models?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setGeminiModels(data.gemini || []);
        setGroqModels(data.groq || []);
        setHasFetched(true);
      }
    } catch (err) {
      console.warn("[ModelSelector] Failed to fetch models:", err);
    } finally {
      setLoading(false);
    }
  }, [hasFetched]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !hasFetched) {
      fetchModels();
    }
  };

  const handleSelect = (provider: "gemini" | "groq", modelId: string) => {
    const model: SelectedModel = { provider, modelId };
    setSelectedModel(model);
    localStorage.setItem(STORAGE_KEY_MODEL, JSON.stringify(model));
    setIsOpen(false);
    onModelChange?.(model);
  };

  const handleSelectAuto = () => {
    setSelectedModel(null);
    localStorage.removeItem(STORAGE_KEY_MODEL);
    setIsOpen(false);
    onModelChange?.(null);
  };

  // Refresh models list when API keys change
  const refreshModels = useCallback(() => {
    setHasFetched(false);
  }, []);

  // Listen for storage changes (when keys are updated in settings panel)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.includes("autoapply_gemini") || e.key?.includes("autoapply_groq")) {
        refreshModels();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshModels]);

  const displayLabel = selectedModel
    ? getModelDisplayName(selectedModel.modelId)
    : "Auto (Recommended)";

  const ProviderIcon = selectedModel?.provider === "groq" ? Cpu : Sparkles;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200",
          "hover:bg-secondary",
          isOpen
            ? "bg-secondary/80 text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Brain className="w-4 h-4 text-accent flex-shrink-0" />
        <div className="flex-1 text-left min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none mb-0.5">
            Model
          </p>
          <p className="text-xs font-semibold truncate leading-tight">
            {displayLabel}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 animate-scale-in origin-bottom">
          <div className="bg-card border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden max-h-72 flex flex-col">
            {/* Header */}
            <div className="px-3.5 py-2.5 border-b border-border bg-secondary/30">
              <p className="text-xs font-semibold text-foreground">Pilih Model AI</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Model yang digunakan untuk generate email
              </p>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Memuat model...</span>
                </div>
              ) : (
                <div className="p-1.5">
                  {/* Auto Option */}
                  <button
                    onClick={handleSelectAuto}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs transition-all",
                      !selectedModel
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold">Auto</span>
                      <span className="text-muted-foreground ml-1">(Recommended)</span>
                    </div>
                  </button>

                  {/* Gemini Models */}
                  {geminiModels.length > 0 && (
                    <div className="mt-2">
                      <p className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Sparkles className="w-3 h-3 text-primary" />
                        Gemini
                      </p>
                      {geminiModels.map((model) => (
                        <button
                          key={model}
                          onClick={() => handleSelect("gemini", model)}
                          className={cn(
                            "flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-xs transition-all",
                            selectedModel?.modelId === model
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                          )}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                          <span className="truncate font-medium">
                            {getModelDisplayName(model)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Groq Models */}
                  {groqModels.length > 0 && (
                    <div className="mt-2">
                      <p className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Cpu className="w-3 h-3 text-accent" />
                        Groq
                      </p>
                      {groqModels.map((model) => (
                        <button
                          key={model}
                          onClick={() => handleSelect("groq", model)}
                          className={cn(
                            "flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-xs transition-all",
                            selectedModel?.modelId === model
                              ? "bg-accent/10 text-accent border border-accent/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                          )}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-accent/50 flex-shrink-0" />
                          <span className="truncate font-medium">
                            {getModelDisplayName(model)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {geminiModels.length === 0 && groqModels.length === 0 && !loading && (
                    <p className="text-center text-xs text-muted-foreground py-6">
                      Tidak ada model tersedia. Periksa API key di Settings.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
