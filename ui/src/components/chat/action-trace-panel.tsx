"use client";

import { useMemo, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  Wrench,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "running" | "complete" | "error";

interface ToolStep {
  name: string;
  action: string;
  status: StepStatus;
  result?: string;
}

interface ActionTracePanelProps {
  reasoning?: string;
  reasoningDuration?: number;
  isStreaming?: boolean;
  toolCalls: ToolStep[];
}

function getStatusIcon(status: StepStatus) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
    case "complete":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-rose-500" />;
    default:
      return <Clock3 className="h-3.5 w-3.5 text-slate-400" />;
  }
}

function prettyResult(value?: string) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function TraceStep({
  icon,
  title,
  subtitle,
  status,
  detail,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string | null;
  status: StepStatus;
  detail?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasDetail = Boolean(detail?.trim());

  return (
    <Collapsible.Root open={hasDetail ? open : false} onOpenChange={setOpen}>
      <div className="rounded-2xl border border-slate-200 bg-white/80">
        <Collapsible.Trigger
          asChild
          disabled={!hasDetail}
        >
          <button
            type="button"
            className={cn(
              "flex w-full items-start gap-3 px-4 py-3 text-left",
              hasDetail ? "cursor-pointer" : "cursor-default"
            )}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-900">{title}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                  {getStatusIcon(status)}
                  {status}
                </span>
              </div>
              {subtitle ? (
                <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            {hasDetail ? (
              open ? (
                <ChevronDown className="mt-1 h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />
              )
            ) : null}
          </button>
        </Collapsible.Trigger>
        {hasDetail ? (
          <Collapsible.Content className="border-t border-slate-200 px-4 py-3">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-6 text-slate-100">
              {detail}
            </pre>
          </Collapsible.Content>
        ) : null}
      </div>
    </Collapsible.Root>
  );
}

export function ActionTracePanel({
  reasoning,
  reasoningDuration,
  isStreaming = false,
  toolCalls,
}: ActionTracePanelProps) {
  const [open, setOpen] = useState(Boolean(isStreaming));

  const completedCount = useMemo(
    () => toolCalls.filter((tool) => tool.status === "complete").length,
    [toolCalls]
  );

  if (!reasoning?.trim() && toolCalls.length === 0) return null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="mt-4 rounded-3xl border border-slate-200 bg-[#f8fafc] shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
              <Brain className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">
                Agent actions{isStreaming ? " · live" : ""}
              </p>
              <p className="text-xs text-slate-500">
                {toolCalls.length} step{toolCalls.length === 1 ? "" : "s"}
                {toolCalls.length > 0 ? ` · ${completedCount} completed` : ""}
                {typeof reasoningDuration === "number" && reasoningDuration > 0
                  ? ` · ${(Math.round(reasoningDuration / 100) / 10).toFixed(1)}s`
                  : ""}
              </p>
            </div>
            <div className="rounded-full bg-white p-1 text-slate-400 shadow-sm">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content className="border-t border-slate-200 px-4 pb-4 pt-3">
          <div className="space-y-3">
            {reasoning?.trim() ? (
              <TraceStep
                icon={<Brain className="h-4 w-4" />}
                title="Reasoning"
                subtitle={
                  isStreaming
                    ? "Streaming thought process"
                    : "Final reasoning trace"
                }
                status={isStreaming ? "running" : "complete"}
                detail={reasoning}
                defaultOpen={isStreaming}
              />
            ) : null}

            {toolCalls.map((tool, index) => (
              <TraceStep
                key={`${tool.name}-${tool.action}-${index}`}
                icon={<Wrench className="h-4 w-4" />}
                title={tool.name}
                subtitle={tool.action}
                status={tool.status}
                detail={prettyResult(tool.result)}
                defaultOpen={tool.status === "error"}
              />
            ))}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

