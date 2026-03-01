"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  onUpload: (files: File[]) => Promise<void>;
  accept?: Record<string, string[]>;
  maxSize?: number; // in bytes
  uploading?: boolean;
}

export function FileUploadZone({
  onUpload,
  accept = {
    "text/markdown": [".md"],
    "text/plain": [".txt"],
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-excel": [".xls"],
    "text/csv": [".csv"],
    "application/json": [".json"],
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  uploading = false,
}: FileUploadZoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors[0]?.code === "file-too-large") {
          setError(`File too large. Max size: ${Math.round(maxSize / 1024 / 1024)}MB`);
        } else {
          setError(`Invalid file type. Accepted: ${Object.keys(accept).join(", ")}`);
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        await onUpload(acceptedFiles);
      }
    },
    [onUpload, accept, maxSize]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    maxSize,
    noClick: true,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative rounded-lg border-2 border-dashed p-6 transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/50",
        uploading && "opacity-50 pointer-events-none"
      )}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center justify-center text-center">
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Uploading and processing...</p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-muted p-3 mb-3">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {isDragActive ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                className="text-primary hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Supports: Markdown, PDF, Excel (.xlsx), CSV, JSON, Text
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}

interface UploadedFileCardProps {
  file: {
    name: string;
    size: number;
    type: string;
    status: "uploading" | "processing" | "complete" | "error";
    progress?: number;
    error?: string;
  };
  onRemove?: () => void;
}

export function UploadedFileCard({ file, onRemove }: UploadedFileCardProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return Math.round(bytes / 1024 / 1024) + " MB";
  };

  const getIcon = () => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("excel") || file.type.includes("sheet") || file.type.includes("csv")) return "📊";
    if (file.type.includes("json")) return "📋";
    if (file.type.includes("markdown") || file.type.includes("text")) return "📝";
    return "📎";
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
      <div className="text-2xl">{getIcon()}</div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
        
        {file.status === "uploading" && file.progress !== undefined && (
          <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        )}
        
        {file.status === "processing" && (
          <p className="text-xs text-primary flex items-center gap-1 mt-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing...
          </p>
        )}
        
        {file.error && (
          <p className="text-xs text-red-500 mt-1">{file.error}</p>
        )}
      </div>

      {onRemove && file.status !== "uploading" && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
