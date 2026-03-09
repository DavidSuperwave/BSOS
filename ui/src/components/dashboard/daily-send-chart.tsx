"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FALLBACK_SEND_DATA = [
  { day: "Sun", sent: 0 },
  { day: "Mon", sent: 0 },
  { day: "Tue", sent: 0 },
  { day: "Wed", sent: 0 },
  { day: "Thu", sent: 0 },
  { day: "Fri", sent: 0 },
  { day: "Sat", sent: 0 },
];

interface DailySendChartProps {
  embedded?: boolean;
  className?: string;
  data?: { day: string; sent: number }[];
  range?: "24h" | "7d" | "30d";
  onRangeChange?: (range: "24h" | "7d" | "30d") => void;
}

export function DailySendChart({
  embedded = false,
  className,
  data,
  range = "7d",
  onRangeChange,
}: DailySendChartProps) {
  const chartData = data && data.length > 0 ? data : FALLBACK_SEND_DATA;
  const total = chartData.reduce((sum, point) => sum + point.sent, 0);
  const rangeLabel =
    range === "24h" ? "Last 24 hours" : range === "30d" ? "Last 30 days" : "Last 7 days";
  const rangeOptions: Array<{ value: "24h" | "7d" | "30d"; label: string }> = [
    { value: "24h", label: "Today" },
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
  ];

  const chartContent = (
    <div
      key={`chart-content-${range}`}
      className={cn(
        "animate-fade-in transition-opacity duration-300",
        embedded ? "h-52" : "h-56"
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            left: 8,
            right: 8,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="day"
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            cursor={false}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Line
            dataKey="sent"
            type="linear"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  if (embedded) {
    return (
      <div className={className}>
        <div className="p-5 pb-0 flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold tracking-tight">
                Daily Send Volume
              </CardTitle>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {total.toLocaleString()}{" "}
                <span className="text-xs font-medium text-muted-foreground">sent</span>
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rangeLabel}</p>
          </div>
          <div className="flex items-center rounded-lg border border-border bg-muted/50 p-1">
            {rangeOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRangeChange?.(option.value)}
                className={cn(
                  "h-7 px-2 text-xs",
                  range === option.value && "bg-background shadow-sm"
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="p-5 pt-3">{chartContent}</div>
      </div>
    );
  }

  return (
    <Card className={cn("rounded-2xl border-border/80", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold tracking-tight">
              Daily Send Volume
            </CardTitle>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {total.toLocaleString()}{" "}
              <span className="text-xs font-medium text-muted-foreground">sent</span>
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-1">
          {rangeOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onRangeChange?.(option.value)}
              className={cn(
                "h-7 px-2 text-xs",
                range === option.value && "bg-background shadow-sm"
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>{chartContent}</CardContent>
    </Card>
  );
}
