"use client";

import { Button } from "@/components/ui/button";

interface ReportFilterBarProps {
  range: "24h" | "7d" | "30d" | "90d";
  onRangeChange: (range: "24h" | "7d" | "30d" | "90d") => void;
  onRefresh?: () => void;
}

export function ReportFilterBar({
  range,
  onRangeChange,
  onRefresh,
}: ReportFilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={range}
        onChange={(e) => onRangeChange(e.target.value as "24h" | "7d" | "30d" | "90d")}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="24h">Last 24 hours</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>
      {onRefresh ? (
        <Button variant="outline" onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}
    </div>
  );
}
