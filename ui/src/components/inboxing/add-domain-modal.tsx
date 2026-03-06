"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlatformConnection } from "@/components/inboxing/types";

interface SenderName {
  first_name: string;
  last_name: string;
}

interface BulkRow {
  id: string;
  domain: string;
  user_count: 25 | 49 | 99;
  names: string;
  redirect_url: string;
  redirect_type: "NONE" | "REGULAR" | "MASKED";
  tags: string;
  platform_connection_id: string;
}

interface AddDomainModalProps {
  open: boolean;
  companyId: string;
  platforms: PlatformConnection[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const DEFAULT_SENDER: SenderName = { first_name: "Alex", last_name: "Sender" };

function parseNames(raw: string): SenderName[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [first_name, ...rest] = entry.split(" ");
      return { first_name, last_name: rest.join(" ") || "Sender" };
    });
}

function splitDomains(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

async function postProvisionRequest(payload: Record<string, unknown>) {
  const workflowResponse = await fetch("/api/inboxing/workflows/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Backward-compatible fallback for older deployments.
  if (workflowResponse.status === 404) {
    return fetch("/api/inboxing/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  return workflowResponse;
}

export function AddDomainModal({
  open,
  companyId,
  platforms,
  onOpenChange,
  onCreated,
}: AddDomainModalProps) {
  const [mode, setMode] = useState<"quick" | "bulk">("quick");
  const [submitting, setSubmitting] = useState(false);

  const [quickDomainsRaw, setQuickDomainsRaw] = useState("");
  const [quickUserCount, setQuickUserCount] = useState<25 | 49 | 99>(49);
  const [quickTags, setQuickTags] = useState("");
  const [quickRedirectUrl, setQuickRedirectUrl] = useState("");
  const [quickRedirectType, setQuickRedirectType] = useState<"NONE" | "REGULAR" | "MASKED">(
    "REGULAR"
  );
  const [quickPlatformConnectionId, setQuickPlatformConnectionId] = useState("");
  const [senderFirstName, setSenderFirstName] = useState("");
  const [senderLastName, setSenderLastName] = useState("");
  const [senderNames, setSenderNames] = useState<SenderName[]>([]);

  const [bulkRows, setBulkRows] = useState<BulkRow[]>(
    Array.from({ length: 5 }).map((_, idx) => ({
      id: `row-${idx}`,
      domain: "",
      user_count: 49,
      names: "",
      redirect_url: "",
      redirect_type: "REGULAR",
      tags: "",
      platform_connection_id: "",
    }))
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const quickDomains = useMemo(() => splitDomains(quickDomainsRaw), [quickDomainsRaw]);
  const quickCanSubmit = quickDomains.length > 0;

  const appendSender = () => {
    if (!senderFirstName.trim()) return;
    setSenderNames((prev) => [
      ...prev,
      {
        first_name: senderFirstName.trim(),
        last_name: senderLastName.trim() || "Sender",
      },
    ]);
    setSenderFirstName("");
    setSenderLastName("");
  };

  const updateBulkRow = (id: string, patch: Partial<BulkRow>) => {
    setBulkRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addBulkRow = () => {
    setBulkRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        domain: "",
        user_count: 49,
        names: "",
        redirect_url: "",
        redirect_type: "REGULAR",
        tags: "",
        platform_connection_id: "",
      },
    ]);
  };

  const removeBulkRow = (id: string) => {
    setBulkRows((prev) => prev.filter((row) => row.id !== id));
  };

  const downloadTemplate = () => {
    const csv = [
      "domain,user_count,names,redirect_url,redirect_type,tags,platform_connection_id",
      "example.com,49,\"Alex Sender, Sam Ops\",https://example.com,REGULAR,production,",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inboxing-domain-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return;

    const rows = lines.slice(1).map((line, idx) => {
      const [domain, user_count, names, redirect_url, redirect_type, tags, platform_connection_id] =
        line.split(",");
      const parsedUserCount = Number(user_count);
      const safeUserCount = parsedUserCount === 25 || parsedUserCount === 99 ? parsedUserCount : 49;
      return {
        id: `csv-${idx}-${Date.now()}`,
        domain: (domain || "").trim(),
        user_count: safeUserCount as 25 | 49 | 99,
        names: (names || "").replaceAll('"', "").trim(),
        redirect_url: (redirect_url || "").trim(),
        redirect_type:
          redirect_type?.trim().toUpperCase() === "MASKED"
            ? "MASKED"
            : redirect_type?.trim().toUpperCase() === "NONE"
              ? "NONE"
              : "REGULAR",
        tags: (tags || "").trim(),
        platform_connection_id: (platform_connection_id || "").trim(),
      } satisfies BulkRow;
    });
    setBulkRows(rows);
  };

  const submitQuick = async () => {
    setSubmitting(true);
    try {
      const names = senderNames.length > 0 ? senderNames : [DEFAULT_SENDER];
      const tags = quickTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await postProvisionRequest({
        company_id: companyId,
        domains: quickDomains,
        names,
        user_count: quickUserCount,
        tags,
        redirect_url: quickRedirectUrl || undefined,
        redirect_type: quickRedirectType,
        platform_connection_id: quickPlatformConnectionId || undefined,
        auto_upload: Boolean(quickPlatformConnectionId),
        enforce_slots: true,
        notes: "Created from inboxes quick setup flow",
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Failed to create domain(s)" }));
        alert(payload.error || "Failed to create domain(s)");
        return;
      }

      onCreated();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const submitBulk = async () => {
    const validRows = bulkRows.filter((row) => row.domain.trim().length > 0);
    if (validRows.length === 0) return;

    setSubmitting(true);
    try {
      for (const row of validRows) {
        const names = parseNames(row.names);
        const tags = row.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);

        const res = await postProvisionRequest({
          company_id: companyId,
          domains: [row.domain.trim().toLowerCase()],
          names: names.length > 0 ? names : [DEFAULT_SENDER],
          user_count: row.user_count,
          tags,
          redirect_url: row.redirect_url || undefined,
          redirect_type: row.redirect_type,
          platform_connection_id: row.platform_connection_id || undefined,
          auto_upload: Boolean(row.platform_connection_id),
          enforce_slots: true,
          notes: "Created from inboxes bulk setup flow",
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({ error: "Failed to create domain row" }));
          alert(payload.error || `Failed on ${row.domain}`);
          return;
        }
      }

      onCreated();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add New Domain(s)</DialogTitle>
          <DialogDescription>Set up one or more domains with email accounts.</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as "quick" | "bulk")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quick">Quick Setup</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Setup</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "quick" ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Domain(s)</label>
              <Input
                value={quickDomainsRaw}
                onChange={(event) => setQuickDomainsRaw(event.target.value)}
                placeholder="example.com or paste multiple"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Accounts</label>
              <select
                value={quickUserCount}
                onChange={(event) => setQuickUserCount(Number(event.target.value) as 25 | 49 | 99)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value={25}>25</option>
                <option value={49}>49 - Recommended for most users, optimal balance</option>
                <option value={99}>99</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Sender(s)</label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="First"
                  value={senderFirstName}
                  onChange={(event) => setSenderFirstName(event.target.value)}
                />
                <Input
                  placeholder="Last"
                  value={senderLastName}
                  onChange={(event) => setSenderLastName(event.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={appendSender}>
                <Plus className="h-3.5 w-3.5" />
                Add Name
              </Button>
              {senderNames.length > 0 ? (
                <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
                  {senderNames.map((name, idx) => (
                    <div key={`${name.first_name}-${idx}`}>
                      {name.first_name} {name.last_name}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Redirect</label>
                <Input
                  placeholder="https://example.com"
                  className="mt-1"
                  value={quickRedirectUrl}
                  onChange={(event) => setQuickRedirectUrl(event.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  value={quickRedirectType}
                  onChange={(event) =>
                    setQuickRedirectType(event.target.value as "NONE" | "REGULAR" | "MASKED")
                  }
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="NONE">None</option>
                  <option value="REGULAR">Regular (301)</option>
                  <option value="MASKED">Masked</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Tags (Optional)</label>
                <Input
                  placeholder="production, client-a"
                  className="mt-1"
                  value={quickTags}
                  onChange={(event) => setQuickTags(event.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Platform Upload</label>
                <select
                  value={quickPlatformConnectionId}
                  onChange={(event) => setQuickPlatformConnectionId(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">None</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed border-border p-4 text-center">
              <p className="text-sm">Drop CSV file here, or paste columns below</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) parseCsv(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload CSV
                </Button>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  Download Template
                </Button>
              </div>
            </div>
            <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-border p-2">
              {bulkRows.map((row) => (
                <div key={row.id} className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-3"
                    placeholder="example.com or paste multiple"
                    value={row.domain}
                    onChange={(event) => updateBulkRow(row.id, { domain: event.target.value })}
                  />
                  <select
                    value={row.user_count}
                    onChange={(event) =>
                      updateBulkRow(row.id, {
                        user_count: Number(event.target.value) as 25 | 49 | 99,
                      })
                    }
                    className="col-span-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value={25}>25</option>
                    <option value={49}>49</option>
                    <option value={99}>99</option>
                  </select>
                  <Input
                    className="col-span-2"
                    placeholder="Names"
                    value={row.names}
                    onChange={(event) => updateBulkRow(row.id, { names: event.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="https://..."
                    value={row.redirect_url}
                    onChange={(event) =>
                      updateBulkRow(row.id, { redirect_url: event.target.value })
                    }
                  />
                  <select
                    value={row.redirect_type}
                    onChange={(event) =>
                      updateBulkRow(row.id, {
                        redirect_type: event.target.value as "NONE" | "REGULAR" | "MASKED",
                      })
                    }
                    className="col-span-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="NONE">None</option>
                    <option value="REGULAR">301</option>
                    <option value="MASKED">Masked</option>
                  </select>
                  <Input
                    className="col-span-2"
                    placeholder="tags"
                    value={row.tags}
                    onChange={(event) => updateBulkRow(row.id, { tags: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1 h-9 w-9"
                    onClick={() => removeBulkRow(row.id)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addBulkRow}>
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={mode === "quick" ? submitQuick : submitBulk}
            disabled={submitting || (mode === "quick" ? !quickCanSubmit : false)}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "quick"
              ? `Add ${quickDomains.length} Domain(s)`
              : `Add ${bulkRows.filter((row) => row.domain.trim()).length} Domain(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
