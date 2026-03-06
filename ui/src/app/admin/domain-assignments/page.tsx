"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, AlertCircle, Link2 } from "lucide-react";

type DomainStatus = "available" | "reserved" | "assigned" | "suspended" | "reclaimed";

type DomainRecord = {
  id: string;
  domain_name: string;
  domain_type: string;
  status: DomainStatus;
  assigned_to_company_id: string | null;
  assigned_at: string | null;
  sale_price: number | null;
  created_at: string;
};

type Company = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function statusBadgeClass(status: string) {
  switch (status) {
    case "available":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "reserved":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "assigned":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "suspended":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "reclaimed":
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
    default:
      return "bg-zinc-700/30 text-zinc-200 border-zinc-700";
  }
}

export default function AdminDomainAssignmentsPage() {
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [filterStatus, setFilterStatus] = useState<DomainStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const fetchDomains = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "1000"); // Get all for assignment view

      const res = await fetch(`/api/admin/domain-inventory?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load domains");
      const data = await res.json();
      setDomains(Array.isArray(data?.domains) ? data.domains : []);
    } catch (error) {
      console.error(error);
      showToast("error", "Could not load domains.");
    }
  }, [filterStatus, searchQuery, showToast]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/companies", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load companies");
      const data = await res.json();
      setCompanies(Array.isArray(data?.companies) ? data.companies : []);
    } catch (error) {
      console.error(error);
      showToast("error", "Could not load companies.");
    }
  }, [showToast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchDomains(), fetchCompanies()]).finally(() => {
      setLoading(false);
    });
  }, [fetchDomains, fetchCompanies]);

  const handleSelectDomain = (domainId: string) => {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const availableDomains = domains.filter((d) => d.status === "available");
    if (selectedDomains.size === availableDomains.length) {
      setSelectedDomains(new Set());
    } else {
      setSelectedDomains(new Set(availableDomains.map((d) => d.id)));
    }
  };

  const handleAssign = useCallback(async () => {
    if (selectedDomains.size === 0) {
      showToast("error", "Please select at least one domain.");
      return;
    }

    if (!selectedCompanyId) {
      showToast("error", "Please select a company.");
      return;
    }

    setAssigning(true);
    try {
      const domainIds = Array.from(selectedDomains);
      const results = await Promise.allSettled(
        domainIds.map((domainId) =>
          fetch(`/api/admin/domain-inventory/${domainId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "assigned",
              assigned_to_company_id: selectedCompanyId,
            }),
          })
        )
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      if (succeeded > 0) {
        showToast(
          "success",
          `Successfully assigned ${succeeded} domain${succeeded > 1 ? "s" : ""} to company.`
        );
        setSelectedDomains(new Set());
        setSelectedCompanyId("");
        setAssignDialogOpen(false);
        await fetchDomains();
      }

      if (failed > 0) {
        showToast("error", `Failed to assign ${failed} domain${failed > 1 ? "s" : ""}.`);
      }
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to assign domains.");
    } finally {
      setAssigning(false);
    }
  }, [selectedDomains, selectedCompanyId, showToast, fetchDomains]);

  const handleReclaim = useCallback(
    async (domainId: string) => {
      try {
        const res = await fetch(`/api/admin/domain-inventory/${domainId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "reclaimed",
            assigned_to_company_id: null,
          }),
        });

        if (!res.ok) throw new Error("Failed to reclaim domain");

        showToast("success", "Domain reclaimed successfully.");
        await fetchDomains();
      } catch (error) {
        console.error(error);
        showToast("error", "Failed to reclaim domain.");
      }
    },
    [showToast, fetchDomains]
  );

  const availableDomains = domains.filter((d) => d.status === "available");
  const assignedDomains = domains.filter((d) => d.status === "assigned");
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-lg font-semibold">Domain Assignments</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Assign domains to companies and manage domain allocations.
            </p>
          </div>
        </div>

        {toast && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {toast.message}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Available Domains</p>
            <p className="text-2xl font-semibold text-emerald-400 mt-2">
              {loading ? "—" : availableDomains.length}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Assigned Domains</p>
            <p className="text-2xl font-semibold text-blue-400 mt-2">
              {loading ? "—" : assignedDomains.length}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Total Companies</p>
            <p className="text-2xl font-semibold text-white mt-2">
              {loading ? "—" : companies.length}
            </p>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as DomainStatus | "all")}
              className="h-10 rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="reserved">Reserved</option>
            </select>

            <div className="flex-1 flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search domains..."
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>

            {selectedDomains.size > 0 && (
              <Button
                onClick={() => setAssignDialogOpen(true)}
                className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Assign {selectedDomains.size} Domain{selectedDomains.size > 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>

        {/* Available Domains Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Available Domains</h2>
            {availableDomains.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="text-sm text-zinc-400 hover:text-zinc-200"
              >
                {selectedDomains.size === availableDomains.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        availableDomains.length > 0 &&
                        selectedDomains.size === availableDomains.length
                      }
                      onChange={handleSelectAll}
                      className="rounded border-zinc-700 bg-zinc-950"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Domain Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Sale Price</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Loading domains...
                    </td>
                  </tr>
                ) : availableDomains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                      No available domains found.
                    </td>
                  </tr>
                ) : (
                  availableDomains
                    .filter((d) =>
                      searchQuery
                        ? d.domain_name.toLowerCase().includes(searchQuery.toLowerCase())
                        : true
                    )
                    .map((domain) => (
                      <tr key={domain.id} className="border-t border-zinc-800/80">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedDomains.has(domain.id)}
                            onChange={() => handleSelectDomain(domain.id)}
                            className="rounded border-zinc-700 bg-zinc-950"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-100">
                          {domain.domain_name}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{domain.domain_type}</td>
                        <td className="px-4 py-3">
                          <Badge className={`border ${statusBadgeClass(domain.status)}`}>
                            {domain.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-zinc-300">
                          {domain.sale_price !== null
                            ? `$${domain.sale_price.toLocaleString()}`
                            : "—"}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assigned Domains Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">Assigned Domains</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Domain Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Assigned To</th>
                  <th className="px-4 py-3 text-left font-medium">Assigned At</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Loading domains...
                    </td>
                  </tr>
                ) : assignedDomains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                      No assigned domains found.
                    </td>
                  </tr>
                ) : (
                  assignedDomains
                    .filter((d) =>
                      searchQuery
                        ? d.domain_name.toLowerCase().includes(searchQuery.toLowerCase())
                        : true
                    )
                    .map((domain) => {
                      const company = companies.find((c) => c.id === domain.assigned_to_company_id);
                      return (
                        <tr key={domain.id} className="border-t border-zinc-800/80">
                          <td className="px-4 py-3 font-medium text-zinc-100">
                            {domain.domain_name}
                          </td>
                          <td className="px-4 py-3 text-zinc-300">{domain.domain_type}</td>
                          <td className="px-4 py-3 text-zinc-300">
                            {company ? (
                              <div>
                                <p className="font-medium">{company.name}</p>
                                <p className="text-xs text-zinc-500">{company.slug}</p>
                              </div>
                            ) : (
                              domain.assigned_to_company_id || "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {domain.assigned_at
                              ? new Date(domain.assigned_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReclaim(domain.id)}
                                className="h-8 border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                              >
                                Reclaim
                              </Button>
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

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="bg-zinc-900 border border-zinc-800 text-white max-w-md">
            <DialogTitle>Assign Domains to Company</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Select a company to assign {selectedDomains.size} domain
              {selectedDomains.size > 1 ? "s" : ""} to.
            </DialogDescription>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Company</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="h-10 w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
                >
                  <option value="">Select a company...</option>
                  {companies
                    .filter((c) => c.status === "active")
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} ({company.slug})
                      </option>
                    ))}
                </select>
              </div>

              {selectedCompany && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                  <p className="text-zinc-400">Selected Company</p>
                  <p className="font-medium text-zinc-100 mt-1">{selectedCompany.name}</p>
                  <p className="text-xs text-zinc-500 mt-1">Slug: {selectedCompany.slug}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignDialogOpen(false);
                    setSelectedCompanyId("");
                  }}
                  className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={assigning || !selectedCompanyId}
                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
                >
                  {assigning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    "Assign Domains"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
