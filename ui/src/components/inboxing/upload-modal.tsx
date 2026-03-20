"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DomainRecord, PlatformConnection } from "@/components/inboxing/types";

interface UploadModalProps {
  open: boolean;
  companyId: string;
  domains: DomainRecord[];
  platforms: PlatformConnection[];
  initialDomainIds?: string[];
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

export function UploadModal({
  open,
  companyId,
  domains,
  platforms,
  initialDomainIds,
  onOpenChange,
  onCompleted,
}: UploadModalProps) {
  const [mode, setMode] = useState<"domain" | "email">("domain");
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>(initialDomainIds || []);
  const [emailsText, setEmailsText] = useState("");
  const [platformConnectionId, setPlatformConnectionId] = useState("");
  const [enableWarmup, setEnableWarmup] = useState(true);
  const [syncTags, setSyncTags] = useState(true);
  const [skipVerified, setSkipVerified] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [domainSearch, setDomainSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedDomainIds(initialDomainIds || []);
  }, [initialDomainIds, open]);

  const filteredDomains = useMemo(() => {
    const term = domainSearch.trim().toLowerCase();
    if (!term) return domains;
    return domains.filter((domain) => domain.domain.toLowerCase().includes(term));
  }, [domainSearch, domains]);

  const emails = useMemo(
    () =>
      emailsText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    [emailsText]
  );

  const toggleDomain = (domainId: string) => {
    setSelectedDomainIds((prev) =>
      prev.includes(domainId) ? prev.filter((id) => id !== domainId) : [...prev, domainId]
    );
  };

  const onSubmit = async () => {
    if (!platformConnectionId) return;
    if (mode === "domain" && selectedDomainIds.length === 0) return;
    if (mode === "email" && emails.length === 0) return;

    setSubmitting(true);
    try {
      const body =
        mode === "domain"
          ? {
              companyId,
              domain_ids: selectedDomainIds,
              platform_connection_id: platformConnectionId,
              enable_warmup: enableWarmup,
              sync_tags: syncTags,
              skip_verified: skipVerified,
            }
          : {
              companyId,
              emails,
              platform_connection_id: platformConnectionId,
              enable_warmup: enableWarmup,
              sync_tags: syncTags,
              skip_verified: skipVerified,
            };

      const res = await fetch("/api/domains/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Upload failed" }));
        alert(payload.error || "Upload failed");
        return;
      }

      onCompleted();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel =
    mode === "domain"
      ? `Upload ${selectedDomainIds.length} Domain${selectedDomainIds.length === 1 ? "" : "s"}`
      : `Upload ${emails.length} Email${emails.length === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload to Platform</DialogTitle>
          <DialogDescription>
            Upload domains or individual emails to your platform connection.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as "domain" | "email")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="domain">By Domain</TabsTrigger>
            <TabsTrigger value="email">By Email</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "domain" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Domains *</label>
            <Input
              value={domainSearch}
              onChange={(event) => setDomainSearch(event.target.value)}
              placeholder="Search and select domains..."
            />
            <div className="max-h-44 overflow-auto rounded-md border border-border p-2">
              {filteredDomains.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No domains match this search.</p>
              ) : (
                <div className="space-y-2">
                  {filteredDomains.map((domain) => (
                    <label key={domain.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedDomainIds.includes(domain.id)}
                        onChange={() => toggleDomain(domain.id)}
                      />
                      <span>{domain.domain}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium">Paste Emails *</label>
            <textarea
              value={emailsText}
              onChange={(event) => setEmailsText(event.target.value)}
              placeholder="Paste emails here, one per line or comma-separated..."
              className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Emails will be matched to domains in this company.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Platform Connection *</label>
          <select
            value={platformConnectionId}
            onChange={(event) => setPlatformConnectionId(event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Select a connection</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name} ({platform.platform})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 rounded-md border border-border p-3">
          <label className="flex items-center justify-between text-sm">
            <span>Enable Warmup</span>
            <Switch checked={enableWarmup} onCheckedChange={setEnableWarmup} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Sync Domain Tags</span>
            <Switch checked={syncTags} onCheckedChange={setSyncTags} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Skip Already Uploaded</span>
            <Switch checked={skipVerified} onCheckedChange={setSkipVerified} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              submitting ||
              !platformConnectionId ||
              (mode === "domain" ? selectedDomainIds.length === 0 : emails.length === 0)
            }
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
