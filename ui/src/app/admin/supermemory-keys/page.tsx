"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react";

interface PoolKey {
  id: string;
  label: string | null;
  maskedKey: string;
  isActive: boolean;
  assignedCompanyId: string | null;
  assignedAt: string | null;
  createdAt: string;
}

interface PoolStats {
  total: number;
  active: number;
  available: number;
  assigned: number;
}

export default function AdminSupermemoryKeysPage() {
  const [keys, setKeys] = useState<PoolKey[]>([]);
  const [stats, setStats] = useState<PoolStats>({
    total: 0,
    active: 0,
    available: 0,
    assigned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/supermemory-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load key pool");
      setKeys(data.keys || []);
      setStats(
        data.stats || {
          total: 0,
          active: 0,
          available: 0,
          assigned: 0,
        }
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load key pool");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addKey = async () => {
    if (!newKey.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/supermemory-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newKey.trim(), label: newLabel.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to add key");
      setMessage("Supermemory key added to pool.");
      setNewKey("");
      setNewLabel("");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to add key");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (key: PoolKey) => {
    setTogglingId(key.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/supermemory-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: key.id, isActive: !key.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update key");
      setMessage(`Key ${key.maskedKey} is now ${!key.isActive ? "active" : "inactive"}.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to update key");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Supermemory Key Pool</h1>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Keys" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Available" value={stats.available} />
        <StatCard label="Assigned" value={stats.assigned} />
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <ShieldAlert className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Add New Key</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="sm_..."
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Label (optional)"
          />
          <button
            onClick={addKey}
            disabled={saving || !newKey.trim()}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/60 text-zinc-400">
              <tr>
                <th className="text-left px-4 py-3">Key</th>
                <th className="text-left px-4 py-3">Label</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned Company</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Loading key pool...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No keys in pool.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-zinc-200 font-mono">{key.maskedKey}</td>
                    <td className="px-4 py-3 text-zinc-300">{key.label || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${
                          key.isActive
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        {key.isActive ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {key.assignedCompanyId || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(key)}
                        disabled={togglingId === key.id}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {togglingId === key.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        {key.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
