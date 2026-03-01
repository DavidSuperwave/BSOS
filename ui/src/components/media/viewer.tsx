"use client";

import { useEffect, useState } from "react";
import type { MediaFile } from "@/lib/hooks";

interface MediaViewerProps {
  companyId: string;
  media: MediaFile;
  className?: string;
}

export function MediaViewer({ companyId, media, className }: MediaViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadUrl() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/media/${media.id}/file?companyId=${encodeURIComponent(companyId)}`
        );
        const body = await res.json();
        if (!cancelled) setSignedUrl(body.signedUrl || null);
      } catch {
        if (!cancelled) setSignedUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadUrl();
    return () => {
      cancelled = true;
    };
  }, [companyId, media.id]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading media...</div>;
  }
  if (!signedUrl) {
    return <div className="text-sm text-muted-foreground">Media preview unavailable.</div>;
  }

  if (media.file_type === "image") {
    return (
      <img
        src={signedUrl}
        alt={media.file_name}
        className={className || "h-48 w-full rounded-md object-cover"}
      />
    );
  }

  if (media.file_type === "video") {
    return (
      <video
        src={signedUrl}
        controls
        className={className || "h-48 w-full rounded-md bg-black object-cover"}
      />
    );
  }

  if (media.file_type === "audio") {
    return <audio src={signedUrl} controls className={className || "w-full"} />;
  }

  if (media.file_type === "pdf") {
    return (
      <iframe
        src={signedUrl}
        title={media.file_name}
        className={className || "h-72 w-full rounded-md border border-border"}
      />
    );
  }

  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-primary hover:underline"
    >
      Open {media.file_name}
    </a>
  );
}
