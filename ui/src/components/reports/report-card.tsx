"use client";

import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ReportDefinition } from "@/lib/hooks";

interface ReportCardProps {
  report: ReportDefinition;
  data: any[];
  loading?: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

function firstDataKey(data: any[], fallback = "value") {
  if (!Array.isArray(data) || data.length === 0) return fallback;
  const keys = Object.keys(data[0] || {});
  return keys.find((k) => k !== "name" && k !== "day" && k !== "stage") || fallback;
}

function categoryKey(data: any[]) {
  if (!Array.isArray(data) || data.length === 0) return "name";
  const keys = Object.keys(data[0] || {});
  return (
    keys.find((k) => ["name", "day", "stage", "label", "campaign"].includes(k)) || "name"
  );
}

export function ReportCard({ report, data, loading }: ReportCardProps) {
  const category = categoryKey(data);
  const primaryValue = firstDataKey(data);
  const secondaryValue =
    Array.isArray(data) && data[0]
      ? Object.keys(data[0]).find((k) => k !== category && k !== primaryValue)
      : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{report.title}</CardTitle>
        <CardDescription>{report.description || `${report.chart_type} chart`}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading report...
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <>
                {report.chart_type === "line" && (
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey={category} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey={primaryValue} stroke={COLORS[0]} />
                  </LineChart>
                )}

                {report.chart_type === "bar" && (
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey={category} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey={primaryValue} fill={COLORS[0]} />
                  </BarChart>
                )}

                {report.chart_type === "area" && (
                  <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey={category} />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey={primaryValue} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.2} />
                  </AreaChart>
                )}

                {(report.chart_type === "pie" || report.chart_type === "donut") && (
                  <PieChart>
                    <Tooltip />
                    <Pie
                      data={data}
                      dataKey={primaryValue}
                      nameKey={category}
                      innerRadius={report.chart_type === "donut" ? 60 : 0}
                      outerRadius={110}
                    >
                      {data.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                )}

                {report.chart_type === "radar" && (
                  <RadarChart data={data}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey={category} />
                    <PolarRadiusAxis />
                    <Radar dataKey={primaryValue} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
                    <Tooltip />
                  </RadarChart>
                )}

                {report.chart_type === "scatter" && (
                  <ScatterChart>
                    <CartesianGrid />
                    <XAxis dataKey={primaryValue} name={primaryValue} />
                    <YAxis
                      dataKey={secondaryValue || category}
                      name={secondaryValue || category}
                    />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={data} fill={COLORS[0]} />
                  </ScatterChart>
                )}

                {report.chart_type === "funnel" && (
                  <FunnelChart>
                    <Tooltip />
                    <Funnel dataKey={primaryValue} data={data} isAnimationActive>
                      <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey={category} />
                    </Funnel>
                  </FunnelChart>
                )}
              </>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
