"use client";

import { Input } from "@/components/ui/input";

interface StepIntegrationsProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

export function StepIntegrations({ data, onChange }: StepIntegrationsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your tools so Julian can manage campaigns and track meetings. All fields are optional — you can add them later in Settings.
        </p>
      </div>

      <div className="space-y-6">
        {/* PlusVibe */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">PV</div>
            <div>
              <p className="text-sm font-medium text-foreground">PlusVibe</p>
              <p className="text-xs text-muted-foreground">Campaign sending platform</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">API Key</label>
              <Input
                type="password"
                value={data.plusvibe_api_key || ""}
                onChange={(e) => onChange({ plusvibe_api_key: e.target.value })}
                placeholder="pv_..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Workspace ID</label>
              <Input
                value={data.plusvibe_workspace_id || ""}
                onChange={(e) => onChange({ plusvibe_workspace_id: e.target.value })}
                placeholder="ws_..."
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Calendly */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">Ca</div>
            <div>
              <p className="text-sm font-medium text-foreground">Calendly</p>
              <p className="text-xs text-muted-foreground">Meeting scheduling</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">API Key</label>
            <Input
              type="password"
              value={data.calendly_api_key || ""}
              onChange={(e) => onChange({ calendly_api_key: e.target.value })}
              placeholder="cal_..."
              className="mt-1"
            />
          </div>
        </div>

        {/* Close CRM */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">Cl</div>
            <div>
              <p className="text-sm font-medium text-foreground">Close CRM</p>
              <p className="text-xs text-muted-foreground">Lead management</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">API Key</label>
            <Input
              type="password"
              value={data.close_api_key || ""}
              onChange={(e) => onChange({ close_api_key: e.target.value })}
              placeholder="api_..."
              className="mt-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
