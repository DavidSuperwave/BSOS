"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SkillExecutionStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export function SkillExecution({ skillName, steps }: { skillName: string; steps: SkillExecutionStep[] }) {
  const running = steps.some((s) => s.status === "running");
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline">{skillName}</Badge>
        {running ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running...
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{step.label}</span>
            <span>{step.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

