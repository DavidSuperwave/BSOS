"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DomainActionsMenu } from "@/components/inboxing/domain-actions-menu";
import { AddDomainModal } from "@/components/inboxing/add-domain-modal";
import { UploadModal } from "@/components/inboxing/upload-modal";
import type { DomainRecord, PlatformConnection } from "@/components/inboxing/types";

interface DomainsPanelProps {
  companyId: string;
  domains: DomainRecord[];
  platforms: PlatformConnection[];
  onChanged: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Available",
  pending: "Pending",
  failed: "Failed",
  dns_setup: "DNS Setup",
  update_nameservers: "Update NS",
  queued: "Queued",
  setting_up: "Setting Up",
};

function statusClass(status: string) {
  if (status === "active") return "bg-success/10 text-success border-success/20";
  if (status === "failed") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-primary/10 text-primary border-primary/20";
}

export function DomainsPanel({ companyId, domains, platforms, onChanged }: DomainsPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openUploadModal, setOpenUploadModal] = useState(false);
  const [uploadDomainIds, setUploadDomainIds] = useState<string[]>([]);

  const filteredDomains = useMemo(() => {
    return domains.filter((domain) => {
      const bySearch = !search || domain.domain.toLowerCase().includes(search.toLowerCase());
      const byStatus = !statusFilter || domain.status === statusFilter;
      return bySearch && byStatus;
    });
  }, [domains, search, statusFilter]);

  const onUpload = (domain: DomainRecord) => {
    setUploadDomainIds([domain.id]);
    setOpenUploadModal(true);
  };

  const copyDomain = async (domain: string) => {
    await navigator.clipboard.writeText(domain);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Export
          </Button>
          <Button size="sm" onClick={() => setOpenAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add Domain
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {domains.length} domains
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search domains..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">Filtered</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="dns_setup">DNS Setup</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => setStatusFilter("")}>
          All Tags
        </Button>
        <Button variant="outline" size="sm">
          Newest First
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input type="checkbox" />
              </th>
              <th className="p-3">Domain</th>
              <th className="p-3">Status</th>
              <th className="p-3">Progress</th>
              <th className="p-3">Tags</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDomains.map((domain) => (
              <tr key={domain.id} className="border-t border-border hover:bg-muted/10">
                <td className="p-3">
                  <input type="checkbox" />
                </td>
                <td className="p-3 font-medium text-foreground">{domain.domain}</td>
                <td className="p-3">
                  <Badge className={statusClass(domain.status)}>
                    {STATUS_LABELS[domain.status] || domain.status}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="w-32">
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-success"
                        style={{ width: `${domain.status === "active" ? 100 : 35}%` }}
                      />
                    </div>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {domain.status === "active" ? "Complete" : "In Progress"}
                    </span>
                  </div>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {domain.tags?.length ? domain.tags.join(", ") : "Add tags"}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(domain.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyDomain(domain.domain)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onUpload(domain)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <DomainActionsMenu
                      companyId={companyId}
                      domain={domain}
                      onUpload={onUpload}
                      onChanged={onChanged}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing 1 to {filteredDomains.length} of {domains.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>

      <AddDomainModal
        open={openAddModal}
        companyId={companyId}
        platforms={platforms}
        onOpenChange={setOpenAddModal}
        onCreated={onChanged}
      />

      <UploadModal
        open={openUploadModal}
        companyId={companyId}
        domains={domains}
        platforms={platforms}
        initialDomainIds={uploadDomainIds}
        onOpenChange={setOpenUploadModal}
        onCompleted={onChanged}
      />
    </div>
  );
}
