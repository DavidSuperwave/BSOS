"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentActivityItem {
  id: string;
  label: string;
  status: "pending" | "running" | "complete" | "error";
  progress?: number;
}

interface AgentActivityPanelProps {
  tasks: AgentActivityItem[];
  className?: string;
}

export function AgentActivityPanel({ tasks, className }: AgentActivityPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const summary = useMemo(() => {
    const total = tasks.length;
    const complete = tasks.filter((task) => task.status === "complete").length;
    const withProgress = tasks.filter((task) => typeof task.progress === "number");
    const avgProgress = withProgress.length
      ? Math.round(
          withProgress.reduce((sum, task) => sum + (task.progress ?? 0), 0) / withProgress.length
        )
      : Math.round(total > 0 ? (complete / total) * 100 : 0);
    return { total, complete, avgProgress };
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-[1.5rem] border border-[#dfe3eb] bg-white px-5 py-4 shadow-[0_8px_30px_rgba(16,24,40,0.05)]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#ced5e2] text-[#5f687a]">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <span className="text-lg font-medium text-[#3b4354]">
          {summary.complete} of {summary.total}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#edf1f7]">
          <div
            className="h-full rounded-full bg-[#2fc59d] transition-all"
            style={{ width: `${summary.avgProgress}%` }}
          />
        </div>
        <span className="min-w-10 text-right text-sm font-medium text-[#6b7384]">
          {summary.avgProgress}%
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-[#8a91a2]" />
        ) : (
          <ChevronUp className="h-4 w-4 text-[#8a91a2]" />
        )}
      </button>

      {!collapsed ? (
        <div className="mt-4 space-y-2 pl-1">
          {tasks.slice(0, 3).map((task, index) => (
            <div key={task.id} className="relative flex items-center gap-3">
              {index < Math.min(tasks.length, 3) - 1 ? (
                <span className="absolute left-[10px] top-6 h-6 w-px bg-[#d5dbe7]" />
              ) : null}
              <span className="inline-flex h-5 w-5 items-center justify-center">
                {task.status === "complete" ? (
                  <CheckCircle2 className="h-5 w-5 text-[#4b5568]" />
                ) : task.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#3b82f6]" />
                ) : (
                  <Circle className="h-5 w-5 text-[#b3bac9]" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  task.status === "complete" ? "text-[#3d4556]" : "text-[#8a91a2]"
                )}
              >
                {task.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
