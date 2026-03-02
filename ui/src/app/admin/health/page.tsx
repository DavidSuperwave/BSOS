"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

export default function AdminHealthPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bsos/health");
      if (res.ok) setHealth(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadHealth(); }, []);

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle className="h-5 w-5 text-emerald-400" />;
    if (status === "degraded") return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
    return <XCircle className="h-5 w-5 text-red-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">System Health</h1>
        <button
          onClick={loadHealth}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Overall Status */}
      <div className={`p-4 rounded-xl border ${
        health?.overall === "healthy" ? "bg-emerald-500/5 border-emerald-500/20" :
        health?.overall === "degraded" ? "bg-yellow-500/5 border-yellow-500/20" :
        "bg-red-500/5 border-red-500/20"
      }`}>
        <p className={`text-sm font-medium ${
          health?.overall === "healthy" ? "text-emerald-400" :
          health?.overall === "degraded" ? "text-yellow-400" : "text-red-400"
        }`}>
          Overall Status: {health?.overall?.toUpperCase() || "CHECKING..."}
        </p>
        {health?.failures?.length > 0 && (
          <ul className="mt-2 space-y-1">
            {health.failures.map((f: string, i: number) => (
              <li key={i} className="text-xs text-red-400">• {f}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Service Details */}
      <div className="grid gap-4">
        {health?.results?.map((r: any) => (
          <div key={r.service} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusIcon(r.status)}
                <div>
                  <p className="text-sm font-medium text-white capitalize">{r.service}</p>
                  <p className="text-xs text-zinc-500">{r.error || "Operational"}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono text-zinc-400">{r.latency_ms}ms</p>
                <p className={`text-xs ${
                  r.latency_ms < 1000 ? "text-emerald-500" :
                  r.latency_ms < 3000 ? "text-yellow-500" : "text-red-500"
                }`}>
                  {r.latency_ms < 1000 ? "Fast" : r.latency_ms < 3000 ? "Slow" : "Very Slow"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
