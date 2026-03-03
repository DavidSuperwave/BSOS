"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DomainStatus = "available" | "reserved" | "assigned" | "suspended" | "reclaimed";
type DomainType = "elite" | "standard" | "byo";

type DomainRecord = {
  id: string;
  domain_name: string;
  domain_type: DomainType;
  purchase_cost: number | null;
  sale_price: number | null;
  status: DomainStatus;
  assigned_to_company_id: string | null;
  assigned_at: string | null;
  inboxing_id: string | null;
  inboxing_status: string | null;
  mailbox_count: number | null;
  user_count: number | null;
  health_score: number | null;
  tags: string[] | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

type Stats = {
  available_count: number;
  assigned_count: number;
  reserved_count: number;
  suspended_count: number;
  total_count: number;
  elite_count: number;
  standard_count: number;
  byo_count: number;
  total_purchase_cost: number;
  total_revenue: number;
  monthly_recurring: number;
  total_transactions: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type Transaction = {
  id?: string;
  domain_name?: string;
  type?: string;
  amount?: number;
  created_at?: string;
  status?: string;
  [key: string]: unknown;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const statusOptions: (DomainStatus | "all")[] = ["all", "available", "reserved", "assigned", "suspended", "reclaimed"];
const typeOptions: (DomainType | "all")[] = ["all", "elite", "standard", "byo"];

const emptyStats: Stats = {
  available_count: 0,
  assigned_count: 0,
  reserved_count: 0,
  suspended_count: 0,
  total_count: 0,
  elite_count: 0,
  standard_count: 0,
  byo_count: 0,
  total_purchase_cost: 0,
  total_revenue: 0,
  monthly_recurring: 0,
  total_transactions: 0,
};

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

function domainTypeBadgeClass(domainType: string) {
  switch (domainType) {
    case "elite":
      return "bg-purple-500/15 text-purple-300 border-purple-500/30";
    case "standard":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "byo":
      return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    default:
      return "bg-zinc-700/30 text-zinc-200 border-zinc-700";
  }
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return currencyFormatter.format(value);
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default function AdminDomainInventoryPage() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, pages: 1 });

  const [statusFilter, setStatusFilter] = useState<DomainStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<DomainType | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [statsLoading, setStatsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [newDomainName, setNewDomainName] = useState("");
  const [bulkDomainNames, setBulkDomainNames] = useState("");
  const [newDomainType, setNewDomainType] = useState<DomainType>("standard");
  const [newPurchaseCost, setNewPurchaseCost] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newUserCount, setNewUserCount] = useState<"25" | "49">("25");
  const [newTags, setNewTags] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [provisionViaInboxing, setProvisionViaInboxing] = useState(false);
  const [senderNames, setSenderNames] = useState([{ first_name: "", last_name: "" }]);

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editingDomain, setEditingDomain] = useState<DomainRecord | null>(null);
  const [editSalePrice, setEditSalePrice] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<DomainStatus>("available");
  const [editCompanyId, setEditCompanyId] = useState("");

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/domain-stats", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      setStats(data?.stats ?? emptyStats);
      setRecentTransactions(Array.isArray(data?.recent_transactions) ? data.recent_transactions.slice(0, 10) : []);
    } catch (error) {
      console.error(error);
      showToast("error", "Could not load domain stats.");
    } finally {
      setStatsLoading(false);
    }
  }, [showToast]);

  const fetchDomains = useCallback(async () => {
    setTableLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("domain_type", typeFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("page", String(pagination.page));
      params.set("limit", String(pagination.limit));

      const res = await fetch(`/api/admin/domain-inventory?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load inventory");
      const data = await res.json();
      setDomains(Array.isArray(data?.domains) ? data.domains : []);
      setPagination((prev) => ({
        ...prev,
        ...(data?.pagination ?? {}),
      }));
    } catch (error) {
      console.error(error);
      showToast("error", "Could not load domain inventory.");
    } finally {
      setTableLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, showToast, statusFilter, typeFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const applySearch = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSearchQuery(searchInput);
  }, [searchInput]);

  const resetAddForm = useCallback(() => {
    setNewDomainName("");
    setBulkDomainNames("");
    setNewDomainType("standard");
    setNewPurchaseCost("");
    setNewSalePrice("");
    setNewUserCount("25");
    setNewTags("");
    setNewNotes("");
    setProvisionViaInboxing(false);
    setSenderNames([{ first_name: "", last_name: "" }]);
  }, []);

  const parsedTags = useMemo(
    () =>
      newTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [newTags]
  );

  const handleAddDomains = useCallback(async () => {
    const names = [
      newDomainName.trim(),
      ...bulkDomainNames
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ].filter(Boolean);

    const uniqueNames = Array.from(new Set(names));

    if (uniqueNames.length === 0) {
      showToast("error", "Please provide at least one domain name.");
      return;
    }

    const payload: Record<string, unknown> = {
      domains: uniqueNames.map((domain_name) => ({
        domain_name,
        domain_type: newDomainType,
        purchase_cost: newPurchaseCost ? Number(newPurchaseCost) : null,
        sale_price: newSalePrice ? Number(newSalePrice) : null,
        user_count: Number(newUserCount),
        tags: parsedTags,
        notes: newNotes || null,
      })),
      provision_via_inboxing: provisionViaInboxing,
      names: uniqueNames,
    };

    if (provisionViaInboxing) {
      payload.sender_names = senderNames.filter((s) => s.first_name.trim() || s.last_name.trim());
    }

    setAddSubmitting(true);
    try {
      const res = await fetch("/api/admin/domain-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to add domains");
      }

      await res.json();
      showToast("success", `Added ${uniqueNames.length} domain${uniqueNames.length > 1 ? "s" : ""} to inventory.`);
      setAddOpen(false);
      resetAddForm();
      await Promise.all([fetchDomains(), fetchStats()]);
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to add domains.");
    } finally {
      setAddSubmitting(false);
    }
  }, [bulkDomainNames, fetchDomains, fetchStats, newDomainName, newDomainType, newNotes, newPurchaseCost, newSalePrice, newUserCount, parsedTags, provisionViaInboxing, resetAddForm, senderNames, showToast]);

  const openEditDialog = useCallback((domain: DomainRecord) => {
    setEditingDomain(domain);
    setEditSalePrice(domain.sale_price != null ? String(domain.sale_price) : "");
    setEditTags((domain.tags ?? []).join(", "));
    setEditNotes(domain.notes ?? "");
    setEditStatus(domain.status);
    setEditCompanyId(domain.assigned_to_company_id ?? "");
    setEditOpen(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingDomain) return;

    setEditSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        sale_price: editSalePrice ? Number(editSalePrice) : null,
        tags: editTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: editNotes || null,
        status: editStatus,
      };

      if (editStatus === "assigned") {
        payload.assigned_to_company_id = editCompanyId || null;
      }

      const res = await fetch(`/api/admin/domain-inventory/${editingDomain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to update domain");

      showToast("success", `Updated ${editingDomain.domain_name}.`);
      setEditOpen(false);
      await Promise.all([fetchDomains(), fetchStats()]);
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to update domain.");
    } finally {
      setEditSubmitting(false);
    }
  }, [editCompanyId, editNotes, editSalePrice, editStatus, editTags, editingDomain, fetchDomains, fetchStats, showToast]);

  const quickPatchDomain = useCallback(
    async (domain: DomainRecord, payload: Record<string, unknown>, successMessage: string) => {
      setActionLoading(domain.id);
      try {
        const res = await fetch(`/api/admin/domain-inventory/${domain.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Patch failed");
        showToast("success", successMessage);
        await Promise.all([fetchDomains(), fetchStats()]);
      } catch (error) {
        console.error(error);
        showToast("error", "Action failed. Please try again.");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchDomains, fetchStats, showToast]
  );

  const handleDelete = useCallback(
    async (domain: DomainRecord) => {
      const confirmed = window.confirm(`Delete ${domain.domain_name}? This cannot be undone.`);
      if (!confirmed) return;

      setActionLoading(domain.id);
      try {
        const res = await fetch(`/api/admin/domain-inventory/${domain.id}`, {
          method: "DELETE",
        });

        if (!res.ok) throw new Error("Delete failed");

        showToast("success", `${domain.domain_name} deleted.`);
        await Promise.all([fetchDomains(), fetchStats()]);
      } catch (error) {
        console.error(error);
        showToast("error", "Failed to delete domain.");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchDomains, fetchStats, showToast]
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-lg font-semibold">Admin Domain Inventory</h1>
            <p className="text-zinc-400 text-sm mt-1">Track domain supply, assignments, pricing, and lifecycle operations.</p>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">Purchase Slots</Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border border-zinc-800 text-white max-w-3xl">
              <DialogTitle>Add Domains to Inventory</DialogTitle>
              <DialogDescription className="text-zinc-400">Add one or more domains and configure initial pricing and provisioning options.</DialogDescription>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Domain Name (single)</label>
                  <Input value={newDomainName} onChange={(e) => setNewDomainName(e.target.value)} placeholder="example.com" className="bg-zinc-950 border-zinc-800 text-white" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Domain Type</label>
                  <select
                    value={newDomainType}
                    onChange={(e) => setNewDomainType(e.target.value as DomainType)}
                    className="h-10 w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
                  >
                    <option value="elite">Elite</option>
                    <option value="standard">Standard</option>
                    <option value="byo">BYO</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs text-zinc-400">Bulk Domain Names (one per line)</label>
                  <textarea
                    value={bulkDomainNames}
                    onChange={(e) => setBulkDomainNames(e.target.value)}
                    placeholder={"alpha.com\nbeta.com\ngamma.com"}
                    className="min-h-[100px] w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Purchase Cost ($)</label>
                  <Input value={newPurchaseCost} onChange={(e) => setNewPurchaseCost(e.target.value)} placeholder="120" className="bg-zinc-950 border-zinc-800 text-white" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Sale Price ($)</label>
                  <Input value={newSalePrice} onChange={(e) => setNewSalePrice(e.target.value)} placeholder="499" className="bg-zinc-950 border-zinc-800 text-white" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">User Count</label>
                  <select
                    value={newUserCount}
                    onChange={(e) => setNewUserCount(e.target.value as "25" | "49")}
                    className="h-10 w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
                  >
                    <option value="25">25</option>
                    <option value="49">49</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Tags (comma separated)</label>
                  <Input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="warmup, high-intent" className="bg-zinc-950 border-zinc-800 text-white" />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs text-zinc-400">Notes</label>
                  <textarea
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Optional operational notes"
                    className="min-h-[80px] w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <input
                  id="provision-inboxing"
                  type="checkbox"
                  checked={provisionViaInboxing}
                  onChange={(e) => setProvisionViaInboxing(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                />
                <label htmlFor="provision-inboxing" className="text-sm text-zinc-300">Provision via Inboxing.com</label>
              </div>

              {provisionViaInboxing && (
                <div className="mt-4 rounded-lg border border-zinc-800 p-4 bg-zinc-950/70">
                  <p className="text-sm font-medium">Sender names</p>
                  <p className="text-xs text-zinc-400 mb-3">Used for mailbox provisioning.</p>
                  <div className="space-y-3">
                    {senderNames.map((sender, idx) => (
                      <div key={`${idx}-${sender.first_name}-${sender.last_name}`} className="grid grid-cols-2 gap-3">
                        <Input
                          value={sender.first_name}
                          onChange={(e) => {
                            const next = [...senderNames];
                            next[idx] = { ...next[idx], first_name: e.target.value };
                            setSenderNames(next);
                          }}
                          placeholder="First name"
                          className="bg-zinc-900 border-zinc-800 text-white"
                        />
                        <Input
                          value={sender.last_name}
                          onChange={(e) => {
                            const next = [...senderNames];
                            next[idx] = { ...next[idx], last_name: e.target.value };
                            setSenderNames(next);
                          }}
                          placeholder="Last name"
                          className="bg-zinc-900 border-zinc-800 text-white"
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSenderNames((prev) => [...prev, { first_name: "", last_name: "" }])}
                    className="mt-3 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    Add More
                  </Button>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)} className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800">Cancel</Button>
                <Button onClick={handleAddDomains} disabled={addSubmitting} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                  {addSubmitting ? "Adding..." : "Add to Inventory"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {toast && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${toast.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
            {toast.message}
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {[
            { label: "Total Domains", value: numberFormatter.format(stats.total_count), accent: "text-white" },
            { label: "Available", value: numberFormatter.format(stats.available_count), accent: "text-emerald-400" },
            { label: "Assigned", value: numberFormatter.format(stats.assigned_count), accent: "text-blue-400" },
            { label: "Monthly Revenue", value: formatCurrency(stats.monthly_recurring), accent: "text-white" },
            { label: "Elite Domains", value: numberFormatter.format(stats.elite_count), accent: "text-purple-300" },
            { label: "Standard Domains", value: numberFormatter.format(stats.standard_count), accent: "text-sky-300" },
          ].map((item) => (
            <div key={item.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-400">{item.label}</p>
              <p className={`text-2xl font-semibold mt-2 ${item.accent}`}>
                {statsLoading ? <span className="inline-block animate-pulse text-zinc-600">•••</span> : item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as DomainStatus | "all");
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="h-10 rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  Status: {option}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as DomainType | "all");
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="h-10 rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
            >
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  Type: {option}
                </option>
              ))}
            </select>

            <div className="flex-1 flex gap-2">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search domain, tags, company..."
                className="bg-zinc-950 border-zinc-800 text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
              />
              <Button onClick={applySearch} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">Search</Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-400">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">Domain Name</th>
                  <th className="px-3 py-3 text-left font-medium">Type</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                  <th className="px-3 py-3 text-left font-medium">Sale Price</th>
                  <th className="px-3 py-3 text-left font-medium">Mailboxes</th>
                  <th className="px-3 py-3 text-left font-medium">Assigned To</th>
                  <th className="px-3 py-3 text-left font-medium">Health</th>
                  <th className="px-3 py-3 text-left font-medium">Created</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-zinc-400">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin" />
                        Loading inventory...
                      </div>
                    </td>
                  </tr>
                ) : domains.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-zinc-400">No domains found.</td>
                  </tr>
                ) : (
                  domains.map((domain) => (
                    <tr key={domain.id} className="border-t border-zinc-800/80">
                      <td className="px-3 py-3 font-medium text-zinc-100">{domain.domain_name}</td>
                      <td className="px-3 py-3">
                        <Badge className={`border ${domainTypeBadgeClass(domain.domain_type)}`}>{domain.domain_type}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge className={`border ${statusBadgeClass(domain.status)}`}>{domain.status}</Badge>
                      </td>
                      <td className="px-3 py-3">{formatCurrency(domain.sale_price)}</td>
                      <td className="px-3 py-3">{domain.mailbox_count ?? "—"}</td>
                      <td className="px-3 py-3 text-zinc-300">{domain.assigned_to_company_id ?? "—"}</td>
                      <td className="px-3 py-3">
                        {domain.health_score != null ? (
                          <span className={domain.health_score >= 80 ? "text-emerald-400" : domain.health_score >= 60 ? "text-amber-400" : "text-red-400"}>
                            {domain.health_score}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{formatDate(domain.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-8 border-zinc-700 bg-zinc-950 hover:bg-zinc-800" onClick={() => openEditDialog(domain)}>
                            Edit
                          </Button>

                          {domain.status === "available" && (
                            <Button
                              size="sm"
                              className="h-8 bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20"
                              disabled={actionLoading === domain.id}
                              onClick={() => {
                                const companyId = window.prompt(`Assign ${domain.domain_name} to company ID:`);
                                if (!companyId) return;
                                quickPatchDomain(domain, { status: "assigned", assigned_to_company_id: companyId }, `${domain.domain_name} assigned.`);
                              }}
                            >
                              Assign
                            </Button>
                          )}

                          {domain.status === "assigned" && (
                            <Button
                              size="sm"
                              className="h-8 bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
                              disabled={actionLoading === domain.id}
                              onClick={() =>
                                quickPatchDomain(domain, { status: "reclaimed", assigned_to_company_id: null }, `${domain.domain_name} reclaimed.`)
                              }
                            >
                              Reclaim
                            </Button>
                          )}

                          {domain.status === "available" && (
                            <Button
                              size="sm"
                              className="h-8 bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20"
                              disabled={actionLoading === domain.id}
                              onClick={() => handleDelete(domain)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-zinc-400">
            <p>
              Showing page {pagination.page} of {Math.max(1, pagination.pages)} ({numberFormatter.format(pagination.total)} total)
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
                disabled={pagination.page <= 1 || tableLoading}
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
                disabled={pagination.page >= pagination.pages || tableLoading}
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.pages, prev.page + 1) }))}
              >
                Next
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-lg font-semibold">Recent Transactions</h2>
            <span className="text-xs text-zinc-400">Last 10</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-400">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">Date</th>
                  <th className="px-3 py-3 text-left font-medium">Domain</th>
                  <th className="px-3 py-3 text-left font-medium">Type</th>
                  <th className="px-3 py-3 text-left font-medium">Amount</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {statsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-zinc-400">Loading transactions...</td>
                  </tr>
                ) : recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-zinc-400">No recent transactions.</td>
                  </tr>
                ) : (
                  recentTransactions.map((tx, idx) => (
                    <tr key={tx.id ?? `${tx.domain_name}-${idx}`} className="border-t border-zinc-800/80">
                      <td className="px-3 py-3 text-zinc-400">{formatDate(typeof tx.created_at === "string" ? tx.created_at : null)}</td>
                      <td className="px-3 py-3 text-zinc-100">{typeof tx.domain_name === "string" ? tx.domain_name : "—"}</td>
                      <td className="px-3 py-3 text-zinc-300">{typeof tx.type === "string" ? tx.type : "—"}</td>
                      <td className="px-3 py-3">{formatCurrency(typeof tx.amount === "number" ? tx.amount : null)}</td>
                      <td className="px-3 py-3">
                        <Badge className={`border ${statusBadgeClass(typeof tx.status === "string" ? tx.status : "reclaimed")}`}>
                          {typeof tx.status === "string" ? tx.status : "unknown"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-zinc-900 border border-zinc-800 text-white max-w-xl">
          <DialogTitle>Edit Domain</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Update pricing, assignment, status, and notes for {editingDomain?.domain_name ?? "selected domain"}.
          </DialogDescription>

          {editingDomain && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                <p className="text-zinc-400">Current Domain</p>
                <p className="font-medium text-zinc-100">{editingDomain.domain_name}</p>
                <p className="text-xs text-zinc-500 mt-1">Type: {editingDomain.domain_type} · Created: {formatDate(editingDomain.created_at)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Sale Price ($)</label>
                  <Input value={editSalePrice} onChange={(e) => setEditSalePrice(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as DomainStatus)}
                    className="h-10 w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
                  >
                    {statusOptions
                      .filter((s): s is DomainStatus => s !== "all")
                      .map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                  </select>
                </div>

                {editStatus === "assigned" && (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs text-zinc-400">Assigned Company ID</label>
                    <Input
                      value={editCompanyId}
                      onChange={(e) => setEditCompanyId(e.target.value)}
                      placeholder="company_123"
                      className="bg-zinc-950 border-zinc-800 text-white"
                    />
                  </div>
                )}

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs text-zinc-400">Tags (comma separated)</label>
                  <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs text-zinc-400">Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="min-h-[90px] w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)} className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800">Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={editSubmitting} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                  {editSubmitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
