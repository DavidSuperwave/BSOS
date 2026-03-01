"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

export function DailySendChart({
  embedded = false,
  className,
  data,
}: DailySendChartProps) {
  const chartData = data && data.length > 0 ? data : FALLBACK_SEND_DATA;
  const total = chartData.reduce((sum, point) => sum + point.sent, 0);
  const isLive = data && data.length > 0;

  const chartContent = (
    <div className={cn("h-56", embedded ? "h-52" : "h-56")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Bar dataKey="sent" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (embedded) {
    return (
      <div className={className}>
        <div className="p-5 pb-0 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold tracking-tight">
              Daily Send Volume
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Last 7 days
            </p>
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {total.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">sent</span>
          </p>
        </div>
        <div className="p-5 pt-3">{chartContent}</div>
      </div>
    );
  }

  return (
    <Card className={cn("rounded-2xl border-border/80", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold tracking-tight">
            Daily Send Volume
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Last 7 days</p>
        </div>
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {total.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">sent</span>
        </p>
      </CardHeader>
      <CardContent>{chartContent}</CardContent>
    </Card>
  );
}
