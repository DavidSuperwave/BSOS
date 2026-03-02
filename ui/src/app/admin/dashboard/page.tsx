"use client";

import { useEffect, useState } from "react";
import {
  Users, Building2, Mail, Activity, MessageSquare,
  AlertTriangle, CheckCircle, XCircle, Clock
} from "lucide-react";

interface Metrics {
  overview: {
    totalCompanies: number;
    activeCompanies: number;
    totalUsers: number;
    totalChatSessions: number;
    totalChatMessages: number;
  };
  containers: { breakdown: Record<string, number> };
  domains: { total: number; healthy: number };
  tasks: { recentBreakdown: Record<string, number> };
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [metricsRes, healthRes] = await Promise.all([
          fetch("/api/admin/metrics"),
          fetch("/api/bsos/health"),
        ]);
        if (metricsRes.ok) setMetrics(await metricsRes.json());
        if (healthRes.ok) setHealth(await healthRes.json());
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  const ov = metrics?.overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <span className="text-xs text-zinc-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </span>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Companies" value={ov?.totalCompanies || 0} sub={`${ov?.activeCompanies || 0} active`} />
        <StatCard icon={Users} label="Users" value={ov?.totalUsers || 0} />
        <StatCard icon={MessageSquare} label="Chat Sessions" value={ov?.totalChatSessions || 0} />
        <StatCard icon={Mail} label="Domains" value={metrics?.domains?.total || 0} sub={`${metrics?.domains?.healthy || 0} healthy`} />
      </div>

      {/* System Health */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">System Health</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {health?.results?.map((r: any) => (
            <div key={r.service} className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
              {r.status === "ok" ? (
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              ) : r.status === "degraded" ? (
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <div>
                <p className="text-sm font-medium text-white capitalize">{r.service}</p>
                <p className="text-xs text-zinc-500">{r.latency_ms}ms</p>
              </div>
            </div>
          )) || (
            <p className="text-sm text-zinc-500 col-span-4">Health data unavailable</p>
          )}
        </div>
      </div>

      {/* Task Breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Container Status</h2>
          <div className="space-y-2">
            {Object.entries(metrics?.containers?.breakdown || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-zinc-400 capitalize">{status}</span>
                <span className="text-sm font-medium text-white">{count as number}</span>
              </div>
            ))}
            {Object.keys(metrics?.containers?.breakdown || {}).length === 0 && (
              <p className="text-sm text-zinc-500">No container data</p>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Tasks</h2>
          <div className="space-y-2">
            {Object.entries(metrics?.tasks?.recentBreakdown || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-zinc-400 capitalize">{status}</span>
                <span className="text-sm font-medium text-white">{count as number}</span>
              </div>
            ))}
            {Object.keys(metrics?.tasks?.recentBreakdown || {}).length === 0 && (
              <p className="text-sm text-zinc-500">No recent tasks</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: any; label: string; value: number; sub?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
          <Icon className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">{label}</p>
          {sub && <p className="text-xs text-zinc-600">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
