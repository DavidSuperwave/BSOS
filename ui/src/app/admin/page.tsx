"use client";

import { useState, useMemo } from "react";
import { useApiData } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Server,
  Globe,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Users,
  Activity,
  Zap,
  ShieldAlert,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    running: { label: "Running", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    active: { label: "Active", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    provisioning: { label: "Provisioning", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    stopped: { label: "Stopped", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    error: { label: "Error", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    failed: { label: "Failed", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const config = map[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: any;
  subtext?: string;
}) {
  return (
    <div className="glass-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtext && (
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [usageDays, setUsageDays] = useState(7);

  const { data: metrics, isLoading: metricsLoading, mutate: refreshMetrics } = useApiData<any>(
    "/api/admin/metrics"
  );
  const { data: companiesData, isLoading: companiesLoading } = useApiData<any>(
    "/api/admin/companies"
  );
  const { data: usageData, isLoading: usageLoading } = useApiData<any>(
    `/api/admin/usage?days=${usageDays}`
  );

  const isError = metrics === undefined && !metricsLoading;

  // Build token usage chart data from byCompany usage
  const tokenChartData = useMemo(() => {
    if (!usageData?.byCompany) return [];
    return (usageData.byCompany || []).slice(0, 10).map((row: any) => ({
      name: row.companyName || row.companySlug || "Unknown",
      messages: row.messages || 0,
      sessions: row.sessions || 0,
    }));
  }, [usageData]);

  // System health calculations
  const systemHealth = useMemo(() => {
    if (!metrics) return null;
    const tasks = metrics?.tasks;
    const totalTasks = tasks?.total ?? 0;
    const failedTasks = tasks?.failed ?? 0;
    const errorRate = totalTasks > 0 ? ((failedTasks / totalTasks) * 100).toFixed(1) : "0";
    const containerBreakdown = metrics?.containers?.byStatus || {};
    const runningContainers = containerBreakdown.running || 0;
    const totalContainers = Object.values(containerBreakdown as Record<string, number>).reduce(
      (a: number, b: number) => a + b, 0
    );
    return { totalTasks, failedTasks, errorRate, runningContainers, totalContainers };
  }, [metrics]);

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">
            Access denied or failed to load metrics.
          </p>
        </div>
      </div>
    );
  }

  const overview = metrics?.overview;
  const containers = metrics?.containers;
  const domains = metrics?.domains;
  const companies = companiesData?.companies || [];
  const usage = usageData;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">System Overview</h1>
          <p className="text-sm text-muted-foreground">Platform-level monitoring and usage</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refreshMetrics()}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Refresh
        </Button>
      </div>
        {/* Overview Metrics */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Companies"
              value={overview?.totalCompanies ?? "..."}
              icon={Building2}
              subtext={`${overview?.activeCompanies ?? 0} active`}
            />
            <MetricCard
              label="Users"
              value={overview?.totalUsers ?? "..."}
              icon={Users}
            />
            <MetricCard
              label="Chat Sessions"
              value={overview?.totalChatSessions ?? "..."}
              icon={MessageSquare}
              subtext={`${overview?.totalChatMessages ?? 0} messages`}
            />
            <MetricCard
              label="Domains"
              value={domains?.total ?? "..."}
              icon={Globe}
              subtext={`${domains?.healthy ?? 0} healthy`}
            />
          </div>
        </section>

        {/* Container Health */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Container Health</h2>
          <div className="glass-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Container</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agents</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Domains</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {companiesLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No companies found
                    </td>
                  </tr>
                ) : (
                  companies.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-foreground">{c.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{c.slug}</span>
                        </div>
                        {c.industry && (
                          <span className="text-xs text-muted-foreground">{c.industry}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status || "unknown"} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.containerStatus || "none"} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.agents.active}/{c.agents.total}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.domains.total > 0 ? (
                          <span>
                            {c.domains.total}{" "}
                            <span className="text-xs">
                              (avg {Math.round(c.domains.avgHealth)}%)
                            </span>
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Usage */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Usage (Last {usageDays} days)
            </h2>
            <div className="flex gap-1">
              {[7, 14, 30].map((d) => (
                <Button
                  key={d}
                  variant={usageDays === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUsageDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          {usageLoading ? (
            <div className="text-sm text-muted-foreground">Loading usage data...</div>
          ) : usage ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <MetricCard
                  label="Total Messages"
                  value={usage.totals?.messages ?? 0}
                  icon={MessageSquare}
                />
                <MetricCard
                  label="Sessions"
                  value={usage.totals?.sessions ?? 0}
                  icon={Activity}
                />
                <MetricCard
                  label="Tasks"
                  value={usage.totals?.tasks ?? 0}
                  icon={CheckCircle2}
                  subtext={`${usage.totals?.failedTasks ?? 0} failed`}
                />
                <MetricCard
                  label="Active Companies"
                  value={usage.totals?.activeCompanies ?? 0}
                  icon={Building2}
                />
              </div>

              <div className="glass-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Messages</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sessions</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tasks</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(usage.byCompany || []).map((row: any) => (
                      <tr key={row.companyId} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{row.companyName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{row.companySlug}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{row.messages}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{row.sessions}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{row.tasks}</td>
                        <td className="px-4 py-3 text-right">
                          {row.failedTasks > 0 ? (
                            <span className="text-red-400">{row.failedTasks}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>

        {/* Token Usage Chart */}
        {tokenChartData.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              <Zap className="h-4 w-4 inline mr-2" />
              Token Usage by Company
            </h2>
            <div className="glass-card rounded-xl border border-border p-6">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tokenChartData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="messages" name="Messages" fill="#62b7ff" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="sessions" name="Sessions" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* System Health */}
        {systemHealth && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              <ShieldAlert className="h-4 w-4 inline mr-2" />
              System Health
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Containers Up"
                value={`${systemHealth.runningContainers}/${systemHealth.totalContainers}`}
                icon={Server}
                subtext="Running / Total"
              />
              <MetricCard
                label="Error Rate"
                value={`${systemHealth.errorRate}%`}
                icon={AlertTriangle}
                subtext={`${systemHealth.failedTasks} of ${systemHealth.totalTasks} tasks`}
              />
              <MetricCard
                label="Domains Health"
                value={domains?.healthy ?? 0}
                icon={Globe}
                subtext={`of ${domains?.total ?? 0} total`}
              />
              <MetricCard
                label="Active Sessions"
                value={overview?.totalChatSessions ?? 0}
                icon={MessageSquare}
              />
            </div>
          </section>
        )}

        {/* Recent Tasks */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Agent Tasks</h2>
          <div className="glass-card rounded-xl border border-border p-4">
            {metricsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (metrics?.tasks?.recent || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent tasks</p>
            ) : (
              <div className="space-y-2">
                {(metrics?.tasks?.recent || []).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : task.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-400" />
                      )}
                      <span className="text-sm text-foreground">{task.agent_type}</span>
                      <StatusBadge status={task.status} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {task.created_at ? new Date(task.created_at).toLocaleString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
  );
}
