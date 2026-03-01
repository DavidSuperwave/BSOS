"use client";

import { useApiData } from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  Activity,
  Zap,
  MessageSquare,
} from "lucide-react";

interface SkillsHealthData {
  issues: { type: string; severity: string; message: string; action: string }[];
  stats: {
    totalSkills: number;
    activeSkills: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;
  };
  recentExecutions: {
    id: string;
    skillSlug: string;
    status: string;
    duration: number;
    createdAt: string;
  }[];
}

export function SkillsHealthPanel() {
  const { selectedCompany } = useCompany();
  const { data, isLoading } = useApiData<SkillsHealthData>(
    selectedCompany?.id
      ? `/api/companies/${selectedCompany.id}/agent/skills/health`
      : null
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { issues, stats } = data;
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedIssues = [...issues].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Skills Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Installed</p>
            <p className="text-lg font-semibold">{stats.totalSkills}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-lg font-semibold">{stats.activeSkills}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Executions</p>
            <p className="text-lg font-semibold">{stats.totalExecutions}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className="text-lg font-semibold">{stats.successRate}%</p>
          </div>
        </div>

        {/* Issues */}
        {sortedIssues.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              {sortedIssues.length} Issue{sortedIssues.length > 1 ? "s" : ""} Detected
            </p>
            {sortedIssues.map((issue, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      issue.severity === "high"
                        ? "text-red-500"
                        : issue.severity === "medium"
                          ? "text-amber-500"
                          : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{issue.message}</p>
                    <Badge
                      variant="outline"
                      className="text-[10px] mt-1"
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Ask Agent
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border p-3">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            All skills healthy — no issues detected.
          </div>
        )}

        {/* Recent Executions */}
        {data.recentExecutions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Recent Executions</p>
            <div className="space-y-1">
              {data.recentExecutions.slice(0, 5).map((exec) => (
                <div
                  key={exec.id}
                  className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-primary" />
                    <span className="font-medium">{exec.skillSlug}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {exec.duration && (
                      <span className="text-muted-foreground">{exec.duration}ms</span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        exec.status === "completed" || exec.status === "success"
                          ? "text-emerald-600 border-emerald-200"
                          : exec.status === "failed" || exec.status === "error"
                            ? "text-red-600 border-red-200"
                            : ""
                      }`}
                    >
                      {exec.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
