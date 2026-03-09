"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReasoningPanelProps {
  reasoning: string;
  durationMs?: number;
  isStreaming?: boolean;
}

export function ReasoningPanel({ reasoning, durationMs, isStreaming = false }: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isStreaming && reasoning?.trim()) {
      setExpanded(true);
    }
  }, [isStreaming, reasoning]);

  if (!reasoning?.trim()) return null;

  const seconds =
    typeof durationMs === "number" && durationMs > 0
      ? `${Math.round(durationMs / 100) / 10}s`
      : null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">
          Reasoning{isStreaming ? " · Live" : ""}
        </span>
        {seconds && <span className="text-[11px]">({seconds})</span>}
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      <div
        className={cn(
          "overflow-hidden border-t border-border transition-all",
          expanded ? "max-h-[420px]" : "max-h-0 border-t-0"
        )}
      >
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {reasoning}
        </pre>
      </div>
    </div>
  );
}
