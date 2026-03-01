"use client";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportCard } from "@/components/reports/report-card";
import { useCompany } from "@/contexts/company-context";
import { useDashboardMetrics, useReportData, useReports, type ReportDefinition } from "@/lib/hooks";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from "recharts";
import {
  Mail,
  MessageSquare,
  ThumbsUp,
  Download,
  RefreshCw,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

function ReportDataCard({
  report,
  companyId,
  range,
}: {
  report: ReportDefinition;
  companyId: string;
  range: "24h" | "7d" | "30d" | "90d";
}) {
  const { data, isLoading } = useReportData(companyId, report.id, { range });
  return <ReportCard report={report} data={data?.data || []} loading={isLoading} />;
}

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "hsl(var(--success))",
  Neutral: "hsl(var(--primary))",
  Negative: "hsl(var(--destructive))",
  OOO: "hsl(var(--warning))",
  Bounced: "hsl(var(--muted-foreground))",
};

function buildCsvContent(metrics: any): string {
  const lines: string[] = [];
  lines.push("Metric,Value");
  lines.push(`Total Replies,${metrics.totalReplies || 0}`);
  lines.push(`Positive Replies,${metrics.positiveReplies || 0}`);
  lines.push(`Total Sends,${metrics.totalSends || 0}`);
  lines.push(`Active Leads,${metrics.activeLeads || 0}`);
  lines.push(`Meetings Booked,${metrics.meetingsBooked || 0}`);
  lines.push(`Total Campaigns,${metrics.totalCampaigns || 0}`);

  const stats = metrics.plusvibeStats;
  if (stats) {
    lines.push(`Open Rate,${stats.openRate}%`);
    lines.push(`Bounced,${stats.bounced}`);
  }

  if (metrics.campaignPerformance?.length) {
    lines.push("");
    lines.push("Campaign,Sent,Replies,Positive,Reply Rate %");
    for (const c of metrics.campaignPerformance) {
      lines.push(`"${c.name}",${c.sent},${c.replies},${c.positive},${c.rate}`);
    }
  }

  return lines.join("\n");
}

export default function AnalyticsPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<"24h" | "7d" | "30d" | "90d">("7d");
  const { data: metricsData, isLoading: metricsLoading, mutate: refreshMetrics } =
    useDashboardMetrics(companyId, dateRange);
  const { data: reportsData, isLoading: reportsLoading, mutate: refreshReports } =
    useReports(companyId);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void refreshMetrics();
    void refreshReports();
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const handleExport = useCallback(() => {
    if (!metricsData) return;
    const csv = buildCsvContent(metricsData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metricsData, dateRange]);

  const totalReplies = metricsData?.totalReplies || 0;
  const totalPositive = metricsData?.positiveReplies || 0;
  const totalSends = metricsData?.totalSends || 0;
  const avgReplyRate = totalSends > 0 ? ((totalReplies / totalSends) * 100).toFixed(2) : "0.00";
  const avgPositiveRate = totalReplies > 0 ? ((totalPositive / totalReplies) * 100).toFixed(1) : "0.0";

  const sentimentData = useMemo(() => {
    const stats = metricsData?.plusvibeStats;
    if (!stats) return [];
    const positiveCount = metricsData?.positiveReplies || 0;
    const neutralCount = Math.max(0, stats.replied - positiveCount - stats.bounced);
    return [
      { name: "Positive", value: positiveCount, color: SENTIMENT_COLORS.Positive },
      { name: "Neutral", value: neutralCount, color: SENTIMENT_COLORS.Neutral },
      { name: "Bounced", value: stats.bounced || 0, color: SENTIMENT_COLORS.Bounced },
    ].filter((s) => s.value > 0);
  }, [metricsData]);

  const campaignPerformance = metricsData?.campaignPerformance || [];

  return (
    <AppShell
      header={{
        title: "Analytics",
        subtitle: "Reply trends, sentiment analysis, and campaign performance",
        actions: (
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) =>
                setDateRange(e.target.value as "24h" | "7d" | "30d" | "90d")
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!metricsData}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        ),
      }}
    >
      <div className="space-y-6">
        {/* Saved Interactive Reports */}
        {companyId && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Saved Report Cards</CardTitle>
                <CardDescription>
                  Interactive chart panels generated from live workspace data
                </CardDescription>
              </div>
              <ReportFilterBar
                range={dateRange}
                onRangeChange={setDateRange}
                onRefresh={() => void refreshReports()}
              />
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <div className="py-8 text-sm text-muted-foreground">Loading reports...</div>
              ) : (reportsData?.reports || []).length === 0 ? (
                <div className="py-8 text-sm text-muted-foreground">
                  No saved reports yet. Create one via <code>/api/reports</code> to render it here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {(reportsData?.reports || []).map((report) => (
                    <ReportDataCard
                      key={report.id}
                      report={report}
                      companyId={companyId}
                      range={dateRange}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Key Metrics */}
        {metricsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Replies</p>
                  <p className="text-2xl font-bold">{totalReplies.toLocaleString()}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{dateRange} period</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Positive Replies</p>
                  <p className="text-2xl font-bold">{totalPositive.toLocaleString()}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <ThumbsUp className="h-5 w-5 text-success" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{dateRange} period</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Reply Rate</p>
                  <p className="text-2xl font-bold">{avgReplyRate}%</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-warning" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{totalSends.toLocaleString()} sent</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Positive Rate</p>
                  <p className="text-2xl font-bold">{avgPositiveRate}%</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">of {totalReplies.toLocaleString()} replies</p>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Campaign Volume Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Volume Comparison</CardTitle>
            <CardDescription>Emails sent vs replies received per campaign</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignPerformance.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No campaign data available for this period.
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignPerformance.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.12)" />
                    <XAxis type="number" stroke="rgba(28,28,26,0.55)" />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      stroke="rgba(28,28,26,0.55)"
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--foreground))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="sent" fill="hsl(var(--primary))" name="Sent" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="replies" fill="hsl(var(--success))" name="Replies" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="positive" fill="hsl(142 71% 45%)" name="Positive" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sentiment + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Reply Sentiment Distribution</CardTitle>
              <CardDescription>Classification of all replies by sentiment</CardDescription>
            </CardHeader>
            <CardContent>
              {sentimentData.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No reply data available yet.
                </div>
              ) : (
                <>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {sentimentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            color: "hsl(var(--foreground))",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {sentimentData.map((s) => (
                      <div key={s.name} className="text-center p-2 rounded-lg bg-muted/30">
                        <p className="text-lg font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{s.name}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PlusVibe Funnel</CardTitle>
              <CardDescription>Lead lifecycle from contact to reply</CardDescription>
            </CardHeader>
            <CardContent>
              {!metricsData?.plusvibeStats ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  PlusVibe not connected.
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "Total Leads", value: metricsData.plusvibeStats.totalLeads },
                    { label: "Contacted", value: metricsData.plusvibeStats.contacted },
                    { label: "Finished", value: metricsData.plusvibeStats.finished },
                    { label: "Replied", value: metricsData.plusvibeStats.replied },
                    { label: "Positive", value: metricsData.plusvibeStats.positive },
                    { label: "Bounced", value: metricsData.plusvibeStats.bounced },
                  ].map((item) => {
                    const maxVal = metricsData.plusvibeStats!.totalLeads || 1;
                    const pct = Math.round((item.value / maxVal) * 100);
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium">{item.value.toLocaleString()}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/25">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      <strong>Open Rate:</strong> {metricsData.plusvibeStats.openRate}%
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Campaign Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Performance</CardTitle>
            <CardDescription>Reply rates and positive sentiment by campaign</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignPerformance.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No campaign performance data available for this period.
              </div>
            ) : (
              <div className="space-y-4">
                {campaignPerformance.map((campaign) => {
                  const positiveRate = campaign.replies > 0
                    ? ((campaign.positive / campaign.replies) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <div
                      key={campaign.name}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{campaign.name}</h4>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>{campaign.sent.toLocaleString()} sent</span>
                          <span>{campaign.replies.toLocaleString()} replies</span>
                          <span>{campaign.positive.toLocaleString()} positive</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Reply Rate</p>
                          <p className={`font-bold ${campaign.rate >= 3 ? "text-success" : campaign.rate >= 2 ? "text-warning" : "text-destructive"}`}>
                            {campaign.rate}%
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Positive Rate</p>
                          <p className="font-bold">
                            {positiveRate}%
                          </p>
                        </div>

                        <Badge
                          variant={campaign.rate >= 3 ? "default" : campaign.rate >= 2 ? "secondary" : "destructive"}
                        >
                          {campaign.rate >= 3 ? "High Performer" : campaign.rate >= 2 ? "Average" : "Needs Work"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
