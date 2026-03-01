"use client";

import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink } from "lucide-react";

const TAG_COLORS: Record<string, string> = {
  profile: "bg-blue-100 text-blue-700",
  icp: "bg-green-100 text-green-700",
  campaign: "bg-purple-100 text-purple-700",
  research: "bg-amber-100 text-amber-700",
  asset: "bg-pink-100 text-pink-700",
  analysis: "bg-cyan-100 text-cyan-700",
};

const ACTION_COLORS: Record<string, string> = {
  Created: "bg-green-500/20 text-green-400 border-green-500/30",
  Updated: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Found: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

interface DocumentCreatedCardProps {
  documentId: string;
  title: string;
  primaryTag?: string;
  secondaryTags?: string[];
  relationships?: {
    derived_from?: string[];
    related_to?: string[];
  };
  projectId?: string;
  action?: "Created" | "Updated" | "Found";
}

export function DocumentCreatedCard({
  documentId,
  title,
  primaryTag,
  secondaryTags = [],
  relationships,
  projectId,
  action = "Created",
}: DocumentCreatedCardProps) {
  const tagColor = primaryTag ? TAG_COLORS[primaryTag] || "bg-muted text-muted-foreground" : "";
  const actionColor = ACTION_COLORS[action] || ACTION_COLORS.Created;

  const kbUrl = projectId
    ? `/knowledge/p/${projectId}?doc=${documentId}`
    : `/knowledge?doc=${documentId}`;

  const relCount =
    (relationships?.derived_from?.length || 0) +
    (relationships?.related_to?.length || 0);

  return (
    <div className="mt-2 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {title}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${actionColor}`}
            >
              {action}
            </Badge>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {primaryTag && (
              <Badge className={`text-[10px] px-1.5 py-0 ${tagColor}`}>
                {primaryTag}
              </Badge>
            )}
            {secondaryTags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[10px] px-1.5 py-0"
              >
                {tag}
              </Badge>
            ))}
            {relCount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {relCount} linked doc{relCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <a
            href={kbUrl}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View in Knowledge Base
          </a>
        </div>
      </div>
    </div>
  );
}
