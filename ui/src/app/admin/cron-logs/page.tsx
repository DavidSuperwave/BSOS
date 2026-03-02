"use client";

import { useEffect, useState } from "react";
import { Settings, RefreshCw, Clock } from "lucide-react";

export default function AdminCronLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/bsos/admin/cron-logs");
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Cron Logs</h1>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Type</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Ran At</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-zinc-500 text-sm">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-zinc-500 text-sm">No cron logs found</td></tr>
            ) : (
              logs.map((log, i) => (
                <tr key={i} className="hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-sm text-white">{log.type || "—"}</td>
                  <td className="px-5 py-3 text-sm text-zinc-400">
                    {log.ran_at ? new Date(log.ran_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3 text-sm text-zinc-400">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {typeof log.result === "object" ? JSON.stringify(log.result, null, 2) : log.result}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
