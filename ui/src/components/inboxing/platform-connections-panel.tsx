"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlatformConnection } from "@/components/inboxing/types";

interface PlatformConnectionsPanelProps {
  companyId: string;
  platforms: PlatformConnection[];
  onChanged: () => void;
}

interface AddConnectionForm {
  platform: "plusvibe" | "instantly" | "smartlead" | "email_bison";
  name: string;
  username: string;
  password: string;
  api_key: string;
  workspace_id: string;
}

const INITIAL_FORM: AddConnectionForm = {
  platform: "plusvibe",
  name: "",
  username: "",
  password: "",
  api_key: "",
  workspace_id: "",
};

export function PlatformConnectionsPanel({
  companyId,
  platforms,
  onChanged,
}: PlatformConnectionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddConnectionForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/inboxing/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          ...form,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Failed to create connection" }));
        alert(payload.error || "Failed to create connection");
        return;
      }
      setForm(INITIAL_FORM);
      setOpen(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this platform connection?")) return;
    const res = await fetch(
      `/api/inboxing/platforms/${id}?companyId=${encodeURIComponent(companyId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "Failed to delete connection" }));
      alert(payload.error || "Failed to delete connection");
      return;
    }
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Platform Connections</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {platforms.map((platform) => (
          <Card key={platform.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{platform.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {platform.platform} • {platform.verification_status || "pending"}
              </p>
              <Button variant="ghost" size="icon" onClick={() => onDelete(platform.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Platform Connection</DialogTitle>
            <DialogDescription>
              Connect your platform account to upload email accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Platform Type *</label>
              <select
                value={form.platform}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    platform: event.target.value as AddConnectionForm["platform"],
                  }))
                }
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="instantly">Instantly</option>
                <option value="smartlead">Smartlead</option>
                <option value="plusvibe">PlusVibe</option>
                <option value="email_bison">Email Bison</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Connection Name *</label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Production Account"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Login Email *</label>
              <Input
                value={form.username}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, username: event.target.value }))
                }
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {form.platform === "plusvibe" ? "PlusVibe Password *" : "Password"}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Enter password"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {form.platform === "plusvibe" ? "PlusVibe API Key *" : "API Key"}
              </label>
              <Input
                value={form.api_key}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, api_key: event.target.value }))
                }
                placeholder="Enter API key"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {form.platform === "plusvibe" ? "Workspace ID *" : "Workspace ID"}
              </label>
              <Input
                value={form.workspace_id}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, workspace_id: event.target.value }))
                }
                placeholder="Enter workspace ID"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving || !form.name || !form.platform}>
              Save Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
