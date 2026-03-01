"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SupermemoryDocument } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { FileText, Calendar } from "lucide-react";

interface SupermemoryDocumentCardProps {
  document: SupermemoryDocument;
  isSelected?: boolean;
  onClick?: () => void;
}

export function SupermemoryDocumentCard({
  document,
  isSelected,
  onClick,
}: SupermemoryDocumentCardProps) {
  const resolvedContent = document.content || document.raw || "";
  const title =
    document.title ||
    document.metadata?.title ||
    resolvedContent.split("\n")[0]?.replace(/^#+\s*/, "") ||
    "Untitled";

  const type = document.type || document.metadata?.type || "document";
  const folder =
    (typeof document.metadata?.folder === "string" && document.metadata.folder.trim()) ||
    (typeof document.metadata?.category === "string" && document.metadata.category.trim()) ||
    "Unfiled";
  const createdAt = document.createdAt || document.metadata?.created_at
    ? new Date(document.createdAt || document.metadata?.created_at).toLocaleDateString()
    : null;

  const contentPreview = resolvedContent
    .split("\n")
    .slice(1)
    .join(" ")
    .trim()
    .substring(0, 110);

  return (
    <Card
      onClick={onClick}
      className={`glass-card cursor-pointer border transition-all hover:-translate-y-0.5 hover:shadow-sm ${
        isSelected
          ? "ring-2 ring-primary/40 border-primary/40"
          : "border-border"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 rounded-md border border-border bg-background p-1.5">
            <FileText className="h-4 w-4 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
              <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] font-medium">
                {type}
              </Badge>
            </div>

            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {contentPreview ? `${contentPreview}...` : "No content preview available"}
            </p>

            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border bg-background px-2 py-0.5">
                {folder}
              </span>
              {createdAt && (
                <span className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5">
                  <Calendar className="h-3 w-3" />
                  {createdAt}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
