"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { format } from "date-fns";

interface DocumentCardProps {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
  isSelected?: boolean;
  onClick?: () => void;
}

const categoryColors: Record<string, string> = {
  icp: "bg-primary/10 text-primary border-primary/25",
  research: "bg-info/10 text-info border-info/25",
  campaign: "bg-success/10 text-success border-success/25",
  company: "bg-warning/10 text-warning border-warning/25",
};

export function DocumentCard({
  title,
  category,
  content,
  updatedAt,
  isSelected,
  onClick,
}: DocumentCardProps) {
  let preview = content.slice(0, 150);
  try {
    const parsed = JSON.parse(content);
    if (parsed?.content && Array.isArray(parsed.content)) {
      const flatText = parsed.content
        .flatMap((node: any) =>
          Array.isArray(node?.content)
            ? node.content.map((child: any) => child?.text || "")
            : []
        )
        .join(" ");
      if (flatText.trim()) preview = flatText.slice(0, 150);
    }
  } catch {
    // Keep plain text preview for legacy docs.
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-4 transition-all",
        isSelected
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card hover:bg-muted/50 hover:border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-foreground truncate">{title}</h4>
            <Badge
              className={cn(
                "text-[10px] shrink-0",
                categoryColors[category] || "bg-muted text-muted-foreground"
              )}
            >
              {category}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {preview}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {updatedAt ? format(new Date(updatedAt), "MMM d, yyyy") : "No date"}
          </p>
        </div>
      </div>
    </button>
  );
}
