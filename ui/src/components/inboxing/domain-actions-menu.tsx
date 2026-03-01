"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DomainRecord } from "@/components/inboxing/types";

interface DomainActionsMenuProps {
  companyId: string;
  domain: DomainRecord;
  onUpload: (domain: DomainRecord) => void;
  onChanged: () => void;
}

async function downloadCsv(companyId: string, domain: DomainRecord) {
  const res = await fetch(
    `/api/inboxing/domains/${domain.id}/csv?companyId=${encodeURIComponent(companyId)}`
  );
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Download failed" }));
    alert(payload.error || "Download failed");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${domain.domain}-credentials.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DomainActionsMenu({
  companyId,
  domain,
  onUpload,
  onChanged,
}: DomainActionsMenuProps) {
  const onCopyDomain = async () => {
    await navigator.clipboard.writeText(domain.domain);
  };

  const onViewNameservers = async () => {
    const res = await fetch(
      `/api/inboxing/domains/${domain.id}/nameservers?companyId=${encodeURIComponent(companyId)}`
    );
    const payload = await res.json();
    if (!res.ok) {
      alert(payload.error || "Failed to load nameservers");
      return;
    }
    const nameservers = (payload.nameservers || []) as string[];
    if (nameservers.length === 0) {
      alert("No nameservers available yet.");
      return;
    }
    alert(nameservers.join("\n"));
  };

  const onEditTags = async () => {
    const value = window.prompt(
      "Enter comma-separated tags",
      Array.isArray(domain.tags) ? domain.tags.join(", ") : ""
    );
    if (value === null) return;
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const res = await fetch(`/api/inboxing/domains/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, tags }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "Failed to update tags" }));
      alert(payload.error || "Failed to update tags");
      return;
    }

    onChanged();
  };

  const onUpdateRedirect = async () => {
    const redirectUrl = window.prompt("Redirect URL (blank to clear)", "");
    if (redirectUrl === null) return;
    const redirectType = window.prompt("Redirect type: NONE | REGULAR | MASKED", "REGULAR");
    if (redirectType === null) return;

    const res = await fetch(`/api/inboxing/domains/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        redirect_url: redirectUrl || null,
        redirect_type: redirectType.toUpperCase(),
      }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "Failed to update redirect" }));
      alert(payload.error || "Failed to update redirect");
      return;
    }
    onChanged();
  };

  const onChangeNames = async () => {
    const value = window.prompt(
      "Sender names as 'First Last, First Last' (used for reprovisioning metadata)",
      ""
    );
    if (!value) return;
    const names = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [first_name, ...rest] = entry.split(" ");
        return { first_name, last_name: rest.join(" ") || "Sender" };
      });

    const res = await fetch(`/api/inboxing/domains/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, names }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "Failed to update names" }));
      alert(payload.error || "Failed to update names");
      return;
    }
    onChanged();
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete ${domain.domain}?`)) return;

    const res = await fetch(
      `/api/inboxing/domains/${domain.id}?companyId=${encodeURIComponent(companyId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "Failed to delete domain" }));
      alert(payload.error || "Failed to delete domain");
      return;
    }
    onChanged();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Mailboxes</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => downloadCsv(companyId, domain)}>
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onUpload(domain)}>
          Upload to Platform
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewNameservers}>View Nameservers</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuItem onClick={onEditTags}>Edit Tags</DropdownMenuItem>
        <DropdownMenuItem onClick={onUpdateRedirect}>Update Redirect</DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeNames}>Change Names & Emails</DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyDomain}>Copy Domain</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          Delete Domain
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
