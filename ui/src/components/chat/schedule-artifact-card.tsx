"use client";

import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GeneratedArtifactSelection } from "./generated-artifact-types";

interface ScheduleArtifactCardProps {
  automationId?: string;
  title: string;
  deliveryHourUtc: number;
  enabled?: boolean;
  reportId?: string;
  onOpen?: (artifact: GeneratedArtifactSelection) => void;
}

function formatHour(hour: number) {
  const normalized = Math.min(23, Math.max(0, Math.trunc(hour)));
  return `${String(normalized).padStart(2, "0")}:00 UTC`;
}

export function ScheduleArtifactCard({
  automationId,
  title,
  deliveryHourUtc,
  enabled = true,
  reportId,
  onOpen,
}: ScheduleArtifactCardProps) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Clock3 className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Daily automation
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Runs every day at {formatHour(deliveryHourUtc)} and generates a fresh report document
            in the background.
          </p>
          {reportId ? (
            <p className="text-xs text-muted-foreground">Linked report: {reportId}</p>
          ) : null}
          {onOpen ? (
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onOpen({
                    type: "schedule",
                    automationId,
                    title,
                    deliveryHourUtc,
                    enabled,
                    reportId,
                  })
                }
              >
                View file
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
