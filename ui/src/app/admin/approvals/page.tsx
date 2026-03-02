"use client";

import { useEffect, useState } from "react";
import { Bell, Check, X, Clock } from "lucide-react";

export default function AdminApprovalsPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For admin, get all company approvals
    async function load() {
      try {
        const companiesRes = await fetch("/api/admin/companies");
        if (!companiesRes.ok) return;
        const { companies } = await companiesRes.json();

        const allApprovals: any[] = [];
        for (const company of (companies || []).slice(0, 10)) {
          try {
            const res = await fetch(`/api/bsos/approvals?company_id=${company.id}`);
            if (res.ok) {
              const data = await res.json();
              allApprovals.push(...(data.approvals || []).map((a: any) => ({
                ...a,
                company_name: company.name,
              })));
            }
          } catch { /* skip */ }
        }
        setApprovals(allApprovals);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const handleResolve = async (id: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/bsos/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Pending Approvals</h1>

      {loading ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
          Loading approvals...
        </div>
      ) : approvals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Bell className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{approval.skill_name}</span>
                    <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full">
                      {approval.action_type}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400">{approval.rationale}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-zinc-600">{approval.company_name}</span>
                    <span className="text-xs text-zinc-600">
                      Confidence: {((approval.confidence_score || 0) * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs text-zinc-600">
                      {new Date(approval.submitted_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResolve(approval.id, "approved")}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-colors"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button
                    onClick={() => handleResolve(approval.id, "rejected")}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors"
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
