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
import { Loader2, CheckCircle2, AlertCircle, Download, Link2, Search, Unlink2 } from "lucide-react";

type InboxingDomain = {
  id: string;
  domain: string;
  status: string;
  user_count: number;
  mailbox_count: number;
  tags: string[];
  nameservers: string[];
  csv_available_at?: string;
  created_at: string;
  redirect_url?: string;
  redirect_type?: string;
  assigned_to_company_id?: string | null;
  assigned_to_company_name?: string | null;
  assigned_to_company_slug?: string | null;
  assigned_at?: string | null;
  assignment_status?: string | null;
};

type User = {
  user_id: string;
  email: string;
  name?: string;
  company_id?: string | null;
  company_name?: string | null;
  company_slug?: string | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "pending":
    case "dns_setup":
    case "update_nameservers":
    case "queued":
    case "setting_up":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-700/30 text-zinc-200 border-zinc-700";
  }
}

type SlotInfo = {
  total: number;
  used: number;
  available: number;
};

export default function AdminInboxingDomainsPage() {
  const [domains, setDomains] = useState<InboxingDomain[]>([]);
  const [slots, setSlots] = useState<SlotInfo | null>(null);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
  const [assignedTotal, setAssignedTotal] = useState(0);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 50,
    total: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [reclaimingId, setReclaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<InboxingDomain | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pagination.page));
      params.set("per_page", String(pagination.per_page));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);

      const res = await fetch(`/api/admin/domains?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load domains");
      const data = await res.json();
      setDomains(Array.isArray(data?.domains) ? data.domains : []);
      setProviderWarning(typeof data?.provider_error === "string" ? data.provider_error : null);
      setAssignedTotal(typeof data?.assigned_total === "number" ? data.assigned_total : 0);
      setPagination((prev) => ({
        ...prev,
        ...(data?.pagination ?? {}),
      }));
    } catch (error) {
      console.error(error);
      showToast("error", "Could not load domains.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.per_page, statusFilter, debouncedSearchQuery, showToast]);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/domains/slots", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSlots(data?.slots || null);
      }
    } catch (error) {
      console.error("Failed to fetch slots:", error);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
    fetchSlots();
  }, [fetchDomains, fetchSlots]);

  const handleSearchUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}&limit=10`);
      if (!res.ok) throw new Error("Failed to search users");
      const data = await res.json();
      setSearchResults(Array.isArray(data?.users) ? data.users : []);
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to search users.");
    } finally {
      setSearchingUsers(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (userSearchQuery.trim()) {
        handleSearchUsers(userSearchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [userSearchQuery, handleSearchUsers]);

  const handleAssign = useCallback(async () => {
    if (!selectedDomain || !selectedUser?.company_id) {
      showToast("error", "Please select a user with a company.");
      return;
    }

    setAssigning(true);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inboxing_ids: [selectedDomain.id],
          company_id: selectedUser.company_id,
          domain_names: {
            [selectedDomain.id]: selectedDomain.domain,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to assign domain");
      }

      showToast("success", `Domain assigned to ${selectedUser.company_name || selectedUser.email}.`);
      setAssignDialogOpen(false);
      setSelectedDomain(null);
      setSelectedUser(null);
      setUserSearchQuery("");
      setSearchResults([]);
      await Promise.all([fetchDomains(), fetchSlots()]);
    } catch (error: any) {
      console.error(error);
      showToast("error", error.message || "Failed to assign domain.");
    } finally {
      setAssigning(false);
    }
  }, [selectedDomain, selectedUser, showToast, fetchDomains, fetchSlots]);

  const handleReclaim = useCallback(async (domain: InboxingDomain) => {
    const confirmed = window.confirm(`Remove assignment for ${domain.domain}?`);
    if (!confirmed) return;

    setReclaimingId(domain.id);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxing_ids: [domain.id] }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to remove assignment");
      }

      showToast("success", `Removed assignment for ${domain.domain}.`);
      await Promise.all([fetchDomains(), fetchSlots()]);
    } catch (error: any) {
      console.error(error);
      showToast("error", error.message || "Failed to remove assignment.");
    } finally {
      setReclaimingId(null);
    }
  }, [fetchDomains, fetchSlots, showToast]);

  const handleDownloadCsv = useCallback(async (domain: InboxingDomain) => {
    try {
      const res = await fetch(`/api/admin/domains/${domain.id}/csv`);
      if (!res.ok) {
        if (res.status === 403) {
          showToast("error", "CSV not available yet (24-hour warmup period).");
        } else {
          throw new Error("Failed to download CSV");
        }
        return;
      }

      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${domain.domain}-mailboxes.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast("success", "CSV downloaded successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to download CSV.");
    }
  }, [showToast]);

  const openAssignDialog = (domain: InboxingDomain) => {
    setSelectedDomain(domain);
    setAssignDialogOpen(true);
    setSelectedUser(null);
    setUserSearchQuery("");
    setSearchResults([]);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-lg font-semibold">Domain Management</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Manage platform domains and assign them to companies.
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

        {providerWarning ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Live Inboxing sync is unavailable right now. Showing locally assigned domains only.
          </div>
        ) : null}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Total Domains</p>
            <p className="text-2xl font-semibold text-white mt-2">
              {loading ? "—" : pagination.total}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Assigned Domains</p>
            <p className="text-2xl font-semibold text-blue-400 mt-2">
              {loading ? "—" : assignedTotal}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Total Slots</p>
            <p className="text-2xl font-semibold text-white mt-2">
              {slots ? slots.total : "—"}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400">Available Slots</p>
            <p className="text-2xl font-semibold text-emerald-400 mt-2">
              {slots ? slots.available : "—"}
            </p>
            {slots && (
              <p className="text-xs text-zinc-500 mt-1">
                {slots.used} used
              </p>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="h-10 rounded-md bg-zinc-950 border border-zinc-800 px-3 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="dns_setup">DNS Setup</option>
              <option value="setting_up">Setting Up</option>
              <option value="failed">Failed</option>
            </select>

            <div className="flex-1 flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search domains..."
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
          </div>
        </div>

        {/* Domains Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Domain Name</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Mailboxes</th>
                  <th className="px-4 py-3 text-left font-medium">Redirect</th>
                  <th className="px-4 py-3 text-left font-medium">Assigned To</th>
                  <th className="px-4 py-3 text-left font-medium">CSV</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Loading domains...
                    </td>
                  </tr>
                ) : domains.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                      No domains found.
                    </td>
                  </tr>
                ) : (
                  domains.map((domain) => (
                    <tr key={domain.id} className="border-t border-zinc-800/80">
                      <td className="px-4 py-3 font-medium text-zinc-100">{domain.domain}</td>
                      <td className="px-4 py-3">
                        <Badge className={`border ${statusBadgeClass(domain.status)}`}>
                          {domain.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {domain.mailbox_count} / {domain.user_count}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {domain.redirect_url ? (
                          <a
                            href={domain.redirect_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs truncate max-w-[200px] block"
                            title={domain.redirect_url}
                          >
                            {domain.redirect_url}
                          </a>
                        ) : (
                          <span className="text-zinc-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {domain.assigned_to_company_name ? (
                          <div>
                            <p className="font-medium">{domain.assigned_to_company_name}</p>
                            <p className="text-xs text-zinc-500">{domain.assigned_to_company_slug}</p>
                          </div>
                        ) : (
                          <span className="text-zinc-500">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {domain.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadCsv(domain)}
                            className="h-8 border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
                          >
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            CSV
                          </Button>
                        ) : (
                          <span className="text-zinc-500 text-xs">Not ready</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {domain.assigned_to_company_id ? (
                            <Button
                              size="sm"
                              onClick={() => handleReclaim(domain)}
                              disabled={reclaimingId === domain.id}
                              className="h-8 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20"
                            >
                              {reclaimingId === domain.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Unlink2 className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              Remove
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => openAssignDialog(domain)}
                              className="h-8 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
                            >
                              <Link2 className="h-3.5 w-3.5 mr-1.5" />
                              Assign
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

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between text-sm text-zinc-400">
              <p>
                Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
                  disabled={pagination.page >= pagination.total_pages || loading}
                  onClick={() =>
                    setPagination((prev) => ({
                      ...prev,
                      page: Math.min(prev.total_pages, prev.page + 1),
                    }))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="bg-zinc-900 border border-zinc-800 text-white max-w-md">
            <DialogTitle>Assign Domain to Company</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Search for a user to assign {selectedDomain?.domain} to their company.
            </DialogDescription>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Search Users</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Type email or name..."
                    className="pl-9 bg-zinc-950 border-zinc-800 text-white"
                  />
                </div>
              </div>

              {searchingUsers && (
                <div className="text-sm text-zinc-400 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="border border-zinc-800 rounded-lg max-h-60 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.user_id}
                      onClick={() => setSelectedUser(user)}
                      className={`w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors ${
                        selectedUser?.user_id === user.user_id ? "bg-zinc-800" : ""
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{user.email}</p>
                      {user.name && <p className="text-xs text-zinc-400">{user.name}</p>}
                      {user.company_name && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Company: {user.company_name} ({user.company_slug})
                        </p>
                      )}
                      {!user.company_id && (
                        <p className="text-xs text-amber-400 mt-1">No company assigned</p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedUser && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                  <p className="text-zinc-400">Selected User</p>
                  <p className="font-medium text-zinc-100 mt-1">{selectedUser.email}</p>
                  {selectedUser.company_name ? (
                    <p className="text-xs text-zinc-500 mt-1">
                      Company: {selectedUser.company_name} ({selectedUser.company_slug})
                    </p>
                  ) : (
                    <p className="text-xs text-amber-400 mt-1">This user has no company</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignDialogOpen(false);
                    setSelectedUser(null);
                    setUserSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={assigning || !selectedUser?.company_id}
                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
                >
                  {assigning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    "Assign Domain"
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
