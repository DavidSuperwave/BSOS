"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Power, Trash2, ShieldAlert, CheckCircle2 } from "lucide-react";

interface AdminCompany {
  id: string;
  name: string;
  slug: string;
  status: string;
  agentStatus: string;
  containerStatus: string;
  createdAt: string;
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingCompanyId, setActingCompanyId] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("admin@superwave.io");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCompanies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load companies");
      setCompanies(data.companies || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const runAction = async (companyId: string, action: string) => {
    setActingCompanyId(companyId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Action failed");
      setMessage(`Action completed: ${action}`);
      await loadCompanies();
    } catch (err: any) {
      setError(err?.message || "Action failed");
    } finally {
      setActingCompanyId(null);
    }
  };

  const runFullReset = async () => {
    setResetLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmToken: "RESET_SINGLE_ADMIN_MODE",
          preserveEmail: resetEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Reset failed");
      setMessage(`Reset complete. Preserved: ${data?.preservedEmail || resetEmail}`);
      await loadCompanies();
    } catch (err: any) {
      setError(err?.message || "Reset failed");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Companies</h1>
        <button
          onClick={loadCompanies}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <ShieldAlert className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/60 text-zinc-400">
              <tr>
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-left px-4 py-3">Container</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Loading companies...
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No companies found.
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const busy = actingCompanyId === company.id;
                  return (
                    <tr key={company.id} className="border-t border-zinc-800">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{company.name}</p>
                        <p className="text-zinc-500 text-xs">{company.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{company.status}</td>
                      <td className="px-4 py-3 text-zinc-300">{company.agentStatus}</td>
                      <td className="px-4 py-3 text-zinc-300">{company.containerStatus}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={busy}
                            onClick={() => runAction(company.id, "decommission_only")}
                            className="px-2.5 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decommission"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => runAction(company.id, "disable_and_decommission")}
                            className="px-2.5 py-1.5 rounded-md bg-red-600/90 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <span className="inline-flex items-center gap-1">
                              <Power className="h-3.5 w-3.5" />
                              Disable
                            </span>
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => runAction(company.id, "enable_company")}
                            className="px-2.5 py-1.5 rounded-md bg-emerald-600/90 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Enable
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Single-Admin Fresh Reset</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Decommissions all company resources, deletes companies, and keeps only one auth user.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            className="w-full sm:w-96 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="admin@superwave.io"
          />
          <button
            onClick={runFullReset}
            disabled={resetLoading || !resetEmail}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {resetLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Run Fresh Reset
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
