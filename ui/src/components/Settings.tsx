'use client';

import { useState, useCallback } from 'react';
import { useApiStatus, useApiData } from '@/lib/hooks';
import { useCompany } from '@/contexts/company-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Key,
  Bell,
  Shield,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  Building2,
  Bot,
  Users,
  Plug,
  Trash2,
  Plus,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CompanySettings from './CompanySettings';

const SERVICES = [
  { key: 'plusvibe', name: 'PlusVibe', description: 'Email campaign platform', envKey: 'PLUSVIBE_API_KEY' },
  { key: 'close', name: 'Close CRM', description: 'CRM and lead management', envKey: 'CLOSE_API_KEY' },
  { key: 'calendly', name: 'Calendly', description: 'Meeting scheduling', envKey: 'CALENDLY_API_KEY' },
  { key: 'supermemory', name: 'Supermemory', description: 'AI knowledge storage', envKey: 'SUPERMEMORY_API_KEY' },
  { key: 'perplexity', name: 'Perplexity AI', description: 'Market research', envKey: 'PERPLEXITY_API_KEY' },
  { key: 'openclaw', name: 'OpenClaw', description: 'AI chat backbone (localhost:18789)', envKey: 'OPENCLAW_URL' },
] as const;

const INTEGRATION_FIELDS = [
  {
    key: 'plusvibe_api_key',
    label: 'PlusVibe API Key',
    placeholder: 'pv_...',
    group: 'PlusVibe',
  },
  {
    key: 'plusvibe_workspace_id',
    label: 'PlusVibe Workspace ID',
    placeholder: 'ws_...',
    group: 'PlusVibe',
  },
  {
    key: 'close_api_key',
    label: 'Close CRM API Key',
    placeholder: 'api_...',
    group: 'Close CRM',
  },
  {
    key: 'calendly_api_key',
    label: 'Calendly API Key',
    placeholder: 'cal_...',
    group: 'Calendly',
  },
  {
    key: 'supermemory_api_key',
    label: 'Supermemory API Key',
    placeholder: 'sm_...',
    group: 'Supermemory',
  },
];

const TABS = [
  { id: 'api', label: 'API Status', icon: Key },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
] as const;

function IntegrationsTab({ companyId }: { companyId: string }) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integration_credentials: credentials,
        }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  // Group by integration
  const groups = INTEGRATION_FIELDS.reduce<Record<string, typeof INTEGRATION_FIELDS>>(
    (acc, field) => {
      (acc[field.group] = acc[field.group] || []).push(field);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Integration Credentials</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Per-company API keys stored in the database. Falls back to global env vars when empty.
        </p>
      </div>

      {Object.entries(groups).map(([group, fields]) => (
        <Card key={group}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {field.label}
                </label>
                <input
                  type="password"
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full max-w-lg rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Credentials
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

function AgentTab({ companyId }: { companyId: string }) {
  const [agentConfig, setAgentConfig] = useState({
    defaultAgentType: 'main',
    autoApprove: true,
    actionBudget: 10,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/companies/${companyId}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_config: agentConfig,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Agent Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Default settings for Julian and sub-agents.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Default Agent Type
            </label>
            <select
              value={agentConfig.defaultAgentType}
              onChange={(e) =>
                setAgentConfig((prev) => ({ ...prev, defaultAgentType: e.target.value }))
              }
              className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="main">Main (Full GTM)</option>
              <option value="campaigns">Campaigns Only</option>
              <option value="inbox">Inbox Only</option>
              <option value="crm">CRM Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Action Budget (per session)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={agentConfig.actionBudget}
              onChange={(e) =>
                setAgentConfig((prev) => ({
                  ...prev,
                  actionBudget: parseInt(e.target.value, 10) || 10,
                }))
              }
              className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum tool calls the agent can make per chat session.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <p className="font-medium text-foreground">Auto-Approve Actions</p>
              <p className="text-sm text-muted-foreground">
                Allow the agent to execute tools without confirmation
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={agentConfig.autoApprove}
                onChange={(e) =>
                  setAgentConfig((prev) => ({ ...prev, autoApprove: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
            </label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Agent Settings
      </Button>
    </div>
  );
}

function TeamTab({ companyId }: { companyId: string }) {
  const { data, isLoading, mutate } = useApiData<{ members: any[] }>(
    companyId ? `/api/companies?members=true&companyId=${companyId}` : null
  );
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const members = data?.members || [];

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Placeholder — will need a proper invite endpoint
      await fetch(`/api/companies/${companyId}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pending_invites: [inviteEmail.trim()],
        }),
      });
      setInviteEmail('');
      mutate();
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Team Members</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage who has access to this company.
        </p>
      </div>

      {/* Invite */}
      <Card>
        <CardContent className="p-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Invite by Email
          </label>
          <div className="flex gap-2 max-w-lg">
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
            />
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="gap-2">
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Invite
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No team members found. Member data is loaded from account_members.
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((m: any) => (
                <div
                  key={m.id || m.user_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                      {(m.email || m.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {m.name || m.email || 'Unknown'}
                      </p>
                      {m.email && (
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      )}
                    </div>
                  </div>
                  <Badge
                    className={
                      m.role === 'owner'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {m.role || 'member'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const [webhookUrl, setWebhookUrl] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure alerts and webhook integrations.
        </p>
      </div>

      {/* Webhook URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Webhook URL (Slack/Email)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="url"
            placeholder="https://hooks.slack.com/services/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full max-w-lg rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
          />
          <p className="text-xs text-muted-foreground">
            Receives JSON payloads for enabled notification types below.
          </p>
        </CardContent>
      </Card>

      {/* Notification toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notification Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Daily GTM Report', desc: 'Comprehensive daily summary', enabled: true },
            { label: 'Positive Reply', desc: 'Immediate alert for interested leads', enabled: true },
            { label: 'Negative Pattern', desc: 'When 3+ similar objections detected', enabled: true },
            { label: 'Deliverability Issue', desc: 'When inbox rate drops below 80%', enabled: true },
            { label: 'Task Failed', desc: 'When an agent task fails execution', enabled: false },
            { label: 'New Meeting Booked', desc: 'When Calendly detects a new booking', enabled: true },
          ].map((notif) => (
            <div
              key={notif.label}
              className="flex items-center justify-between p-4 rounded-lg border border-border"
            >
              <div>
                <p className="font-medium text-foreground">{notif.label}</p>
                <p className="text-sm text-muted-foreground">{notif.desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={notif.enabled}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button className="gap-2">
        <Save className="h-4 w-4" />
        Save Notification Settings
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('api');
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { data: status, isLoading } = useApiStatus(companyId);

  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">API Connections</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Connection status for the selected company. Manage per-company keys in the Integrations tab.
                </p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                </div>
              ) : (
                <div className="space-y-3">
                  {SERVICES.map((service) => {
                    const connected = status?.[service.key as keyof typeof status] ?? false;

                    return (
                      <Card key={service.key}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {connected ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-muted-foreground" />
                              )}
                              <div>
                                <p className="font-medium text-foreground">{service.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {service.description}
                                </p>
                              </div>
                            </div>
                            <Badge
                              className={
                                connected
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-muted text-muted-foreground'
                              }
                            >
                              {connected ? 'Connected' : 'Not configured'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 ml-8">
                            {service.envKey}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'integrations' && companyId && (
            <IntegrationsTab companyId={companyId} />
          )}
          {activeTab === 'integrations' && !companyId && (
            <p className="text-sm text-muted-foreground">Select a company first.</p>
          )}

          {activeTab === 'agent' && companyId && (
            <AgentTab companyId={companyId} />
          )}
          {activeTab === 'agent' && !companyId && (
            <p className="text-sm text-muted-foreground">Select a company first.</p>
          )}

          {activeTab === 'team' && companyId && (
            <TeamTab companyId={companyId} />
          )}
          {activeTab === 'team' && !companyId && (
            <p className="text-sm text-muted-foreground">Select a company first.</p>
          )}

          {activeTab === 'companies' && <CompanySettings />}

          {activeTab === 'general' && (
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedCompany?.name || ''}
                    className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Default Timezone
                  </label>
                  <select className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <option>America/Mexico_City (CST)</option>
                    <option>America/New_York (EST)</option>
                    <option>America/Los_Angeles (PST)</option>
                    <option>Europe/London (GMT)</option>
                    <option>Europe/Berlin (CET)</option>
                  </select>
                </div>

                <Button className="gap-2 mt-4">
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && <NotificationsTab />}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="font-medium text-amber-400">Development Mode</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    API keys are stored in .env file. For production, use a secrets manager.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">Require MFA for Team Members</p>
                      <p className="text-sm text-muted-foreground">
                        Enforce multi-factor authentication for all team logins
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">Agent Action Audit Log</p>
                      <p className="text-sm text-muted-foreground">
                        Log all agent tool executions for compliance review
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
