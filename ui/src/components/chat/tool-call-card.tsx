"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Wrench,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ToolCallCardProps {
  name: string;
  action: string;
  status: "pending" | "running" | "complete" | "error";
  result?: string;
}

export function ToolCallCard({ name, action, status, result }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: <Loader2 className="h-3.5 w-3.5 text-[#8a91a2]" />,
    running: <Loader2 className="h-3.5 w-3.5 text-[#3b82f6] animate-spin" />,
    complete: <CheckCircle2 className="h-3.5 w-3.5 text-[#4f596d]" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-[#d14343]" />,
  };

  const statusColor = {
    pending: "border-[#e2e6ef]",
    running: "border-[#d5def0]",
    complete: "border-[#d8e0ee]",
    error: "border-[#f4cccc]",
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-background/50 text-sm",
        "rounded-2xl border bg-white text-sm shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
        statusColor[status]
      )}
    >
      <button
        onClick={() => result && setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2"
      >
        <Wrench className="h-3.5 w-3.5 text-[#8a91a2]" />
        <span className="font-medium text-[#323a4b]">{name}</span>
        <span className="text-[#80889a]">{action}</span>
        <span className="ml-auto flex items-center gap-1">
          {statusIcon[status]}
          {result &&
            (expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#80889a]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#80889a]" />
            ))}
        </span>
      </button>

      {expanded && result && (
        <div className="border-t border-[#e6e9f0] px-3 py-2">
          <pre className="whitespace-pre-wrap text-xs text-[#80889a]">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
