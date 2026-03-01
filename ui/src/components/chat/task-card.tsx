"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Bot, CheckCircle2, AlertCircle, Clock3, Loader2 } from "lucide-react";

interface TaskCardProps {
  id: string;
  agentType: string;
  objective: string;
  status: "pending" | "running" | "complete" | "error";
  progress?: number;
  step?: string;
  result?: string;
  onApprove?: () => void;
  onReject?: () => void;
  onRetry?: () => void;
}

export function TaskCard({
  id,
  agentType,
  objective,
  status,
  progress,
  step,
  result,
  onApprove,
  onReject,
  onRetry,
}: TaskCardProps) {
  const statusIcon =
    status === "complete" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-[#4f596d]" />
    ) : status === "error" ? (
      <AlertCircle className="h-3.5 w-3.5 text-[#d14343]" />
    ) : status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 text-[#3b82f6] animate-spin" />
    ) : (
      <Clock3 className="h-3.5 w-3.5 text-[#8a91a2]" />
    );

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white px-3 py-2 text-xs shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
        status === "complete" && "border-[#d8e0ee]",
        status === "error" && "border-[#f4cccc]",
        status === "running" && "border-[#d5def0]",
        status === "pending" && "border-[#e2e6ef]"
      )}
    >
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-[#8a91a2]" />
        <span className="font-medium text-[#323a4b] truncate">{objective}</span>
        <Badge variant="outline" className="ml-auto border-[#dbe1eb] text-[10px] text-[#677085]">
          {agentType}
        </Badge>
        {statusIcon}
      </div>
      <div className="mt-1 text-[#80889a]">
        Task {id.slice(0, 8)}{step ? ` - ${step}` : ""}
      </div>
      {typeof progress === "number" ? (
        <div className="mt-2">
          <Progress value={progress} />
        </div>
      ) : null}
      {result ? (
        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[#80889a]">{result}</pre>
      ) : null}
      {(status === "pending" && (onApprove || onReject)) || (status === "error" && onRetry) ? (
        <div className="mt-2 flex items-center gap-2">
          {status === "pending" && onApprove ? (
            <button
              onClick={onApprove}
              className="rounded border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10"
            >
              Approve
            </button>
          ) : null}
          {status === "pending" && onReject ? (
            <button
              onClick={onReject}
              className="rounded border border-red-500/30 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
            >
              Reject
            </button>
          ) : null}
          {status === "error" && onRetry ? (
            <button
              onClick={onRetry}
              className="rounded border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/10"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
