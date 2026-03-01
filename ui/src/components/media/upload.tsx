"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaFile } from "@/lib/hooks";

interface MediaUploadProps {
  companyId: string;
  context?: string;
  contextId?: string;
  onUploaded?: (files: MediaFile[]) => void;
}

export function MediaUpload({
  companyId,
  context,
  contextId,
  onUploaded,
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setStatus("Uploading...");
    const uploaded: MediaFile[] = [];

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("companyId", companyId);
        if (context) formData.append("context", context);
        if (contextId) formData.append("contextId", contextId);

        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || `Failed to upload ${file.name}`);
        }
        if (body.media) uploaded.push(body.media);
      }

      setStatus(`Uploaded ${uploaded.length} file(s).`);
      onUploaded?.(uploaded);
    } catch (err: any) {
      setStatus(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Upload Media</p>
          <p className="text-xs text-muted-foreground">
            Images, video, audio, and PDFs are supported.
          </p>
        </div>
        <Button asChild disabled={uploading}>
          <label className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Select Files"}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </label>
        </Button>
      </div>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
