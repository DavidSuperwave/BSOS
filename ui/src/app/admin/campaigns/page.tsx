"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

export default function AdminCampaignsPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/companies");
        if (res.ok) {
          const data = await res.json();
          setCompanies(data.companies || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Campaign Overview</h1>
      <p className="text-sm text-zinc-400">
        Cross-company campaign monitoring. Select a company to view campaign diagnostics.
      </p>

      <div className="grid gap-4">
        {loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
            Loading companies...
          </div>
        ) : companies.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
            No companies found
          </div>
        ) : (
          companies.map((company: any) => (
            <div key={company.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white">{company.name}</h3>
                  <p className="text-xs text-zinc-500">{company.slug} — {company.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    company.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-700 text-zinc-400"
                  }`}>
                    {company.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
