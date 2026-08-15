"use client";

import { useCallback, useState, useRef } from "react";
import { Upload, Image, FileText, X, Loader2, Cloud, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SavedFileInfo {
  id?: number;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  createdAt?: string;
}

interface FileUploadZoneProps {
  accept: string;
  multiple?: boolean;
  maxFiles?: number;
  label: string;
  description: string;
  icon?: "image" | "pdf";
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  savedFile?: SavedFileInfo | null;
  onDeleteSavedFile?: () => void;
  isUploading?: boolean;
}

export function FileUploadZone({
  accept,
  multiple = false,
  maxFiles = 10,
  label,
  description,
  icon = "image",
  files,
  onFilesChange,
  disabled = false,
  savedFile,
  onDeleteSavedFile,
  isUploading = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      const newFiles = multiple
        ? [...files, ...droppedFiles].slice(0, maxFiles)
        : droppedFiles.slice(0, 1);
      onFilesChange(newFiles);
    },
    [disabled, files, multiple, maxFiles, onFilesChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const selectedFiles = Array.from(e.target.files);
      const newFiles = multiple
        ? [...files, ...selectedFiles].slice(0, maxFiles)
        : selectedFiles.slice(0, 1);
      onFilesChange(newFiles);
    },
    [files, multiple, maxFiles, onFilesChange]
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = files.filter((_, i) => i !== index);
      onFilesChange(newFiles);
    },
    [files, onFilesChange]
  );

  const IconComponent = icon === "image" ? Image : FileText;

  // If a file is already saved in cloud and user hasn't selected a new local file
  const hasSavedFile = Boolean(savedFile && files.length === 0);

  return (
    <div className="space-y-3">
      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Cloud Saved File Card */}
      {hasSavedFile && savedFile ? (
        <div className="p-4 rounded-2xl bg-secondary/60 border border-primary/20 space-y-3 animate-fade-in relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <Cloud className="w-3 h-3" />
              Tersimpan di Cloud
            </span>
            <span className="text-[11px] text-muted-foreground">
              {label}
            </span>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-border/60">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 text-primary">
              <FileText className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-foreground">
                {savedFile.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {savedFile.fileSize
                  ? `${(savedFile.fileSize / 1024 / 1024).toFixed(2)} MB · Siap digunakan`
                  : "Siap digunakan"}
              </p>
            </div>

            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isUploading}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Mengupload...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Ganti File
                </>
              )}
            </button>

            {onDeleteSavedFile && (
              <button
                type="button"
                onClick={onDeleteSavedFile}
                disabled={disabled || isUploading}
                title="Hapus file dari cloud"
                className="py-2 px-3 text-xs font-semibold rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Regular Upload Dropzone */
        <div
          className={cn(
            "upload-zone p-8 text-center",
            isDragging && "dragging",
            (disabled || isUploading) && "opacity-50 cursor-not-allowed"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                isDragging
                  ? "bg-accent/20 text-accent"
                  : "bg-primary/10 text-primary"
              )}
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isDragging ? (
                <Upload className="w-6 h-6 animate-bounce" />
              ) : (
                <IconComponent className="w-6 h-6" />
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>

            <button
              type="button"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              disabled={disabled || isUploading}
            >
              {isUploading ? "Mengupload..." : "Pilih File"}
            </button>
          </div>
        </div>
      )}

      {/* Selected Local File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/50 border border-border animate-scale-in"
            >
              {file.type.startsWith("image/") ? (
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB {isUploading ? "· Mengupload..." : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                disabled={isUploading}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────

export function UploadSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 p-8">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground">Mengupload file...</p>
    </div>
  );
}
