"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Bold,
  CalendarDays,
  Clock3,
  Filter,
  Italic,
  Loader2,
  Link2,
  List,
  ListOrdered,
  Mail,
  Plus,
  Quote,
  Reply,
  Search,
  Send,
  Settings2,
  ThumbsUp,
  Underline,
  Users,
} from "lucide-react";
import { type PlusVibeCampaign, useCampaignLeads, type CampaignLead } from "@/lib/hooks";
import { useStreamingChat } from "@/lib/hooks/use-streaming-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatMessage } from "@/components/chat/chat-message";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CampaignWizardProps {
  campaign: PlusVibeCampaign;
  companyId?: string;
  companyQuery: string;
  onClose: () => void;
  onRefresh: () => void;
}

interface SequenceStepDraft {
  id: string;
  title: string;
  subject: string;
  body: string;
  waitDays: number;
  sent: number;
  openRate: number;
  replyRate: number;
  positiveRate: number;
}

interface SubsequenceDraft {
  id: string;
  name: string;
  conditionType: string;
  conditionValue: string;
  status: "Active" | "Draft";
}

const INITIAL_SEQUENCE_STEPS: SequenceStepDraft[] = [
  {
    id: "step-1",
    title: "Step 1 - Intro",
    subject: "Quick idea for {{company}}",
    body: "Hey {{first_name}}, I noticed {{company}} is scaling outbound...",
    waitDays: 0,
    sent: 412,
    openRate: 71,
    replyRate: 6.4,
    positiveRate: 2.1,
  },
  {
    id: "step-2",
    title: "Step 2 - Follow-up",
    subject: "Worth a quick look?",
    body: "Wanted to bump this in case it got buried...",
    waitDays: 3,
    sent: 276,
    openRate: 63,
    replyRate: 4.1,
    positiveRate: 1.4,
  },
  {
    id: "step-3",
    title: "Step 3 - Final touch",
    subject: "Should I close this out?",
    body: "Last follow-up from me - happy to circle back later.",
    waitDays: 5,
    sent: 181,
    openRate: 58,
    replyRate: 3.3,
    positiveRate: 1.0,
  },
];

const INITIAL_SUBSEQUENCES: SubsequenceDraft[] = [
  {
    id: "sub-1",
    name: "Opened but no reply",
    conditionType: "opened_not_replied",
    conditionValue: "3",
    status: "Active",
  },
  {
    id: "sub-2",
    name: "No reply follow-up",
    conditionType: "reply_not_received",
    conditionValue: "5",
    status: "Draft",
  },
];

export function CampaignWizard({ campaign, companyId, companyQuery, onClose, onRefresh }: CampaignWizardProps) {
  const [activeTab, setActiveTab] = useState("leads");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sequenceAgentError, setSequenceAgentError] = useState<string | null>(null);
  const [sequenceAgentInput, setSequenceAgentInput] = useState("");
  const sequenceAgentEndRef = useRef<HTMLDivElement | null>(null);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadTagFilter, setLeadTagFilter] = useState("all");

  // Real lead data from PlusVibe
  const { data: leadData, mutate: mutateLeads } = useCampaignLeads(campaign.id, companyId);
  const allLeads: CampaignLead[] = leadData?.leads || [];

  // Add lead dialog state
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadCompany, setNewLeadCompany] = useState("");
  const [newLeadTitle, setNewLeadTitle] = useState("");
  const [addingLead, setAddingLead] = useState(false);
  const [importingLeads, setImportingLeads] = useState(false);

  const handleAddLead = async () => {
    if (!newLeadEmail.trim() || !companyId) return;
    setAddingLead(true);
    try {
      const res = await fetch(
        `/api/plusvibe/campaigns/${campaign.id}/leads?companyId=${companyId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newLeadName.trim(),
            email: newLeadEmail.trim(),
            company: newLeadCompany.trim(),
            title: newLeadTitle.trim(),
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to add lead");
      await mutateLeads();
      setIsAddLeadOpen(false);
      setNewLeadName("");
      setNewLeadEmail("");
      setNewLeadCompany("");
      setNewLeadTitle("");
    } catch (err: any) {
      setError(err?.message || "Failed to add lead");
    } finally {
      setAddingLead(false);
    }
  };

  const handleImportLeads = async () => {
    if (!companyId) return;
    setImportingLeads(true);
    try {
      await mutateLeads();
    } finally {
      setImportingLeads(false);
    }
  };

  const [sequenceSteps, setSequenceSteps] = useState<SequenceStepDraft[]>(INITIAL_SEQUENCE_STEPS);
  const [selectedSequenceStepId, setSelectedSequenceStepId] = useState(
    INITIAL_SEQUENCE_STEPS[0]?.id || ""
  );

  const [settingsName, setSettingsName] = useState(campaign.name || "");
  const [dailyLimit, setDailyLimit] = useState("200");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(true);
  const [selectedSenderPool, setSelectedSenderPool] = useState("Primary Senders");

  const [timezone, setTimezone] = useState("America/New_York");
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [sendingDays, setSendingDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [minDelayMinutes, setMinDelayMinutes] = useState("2");

  const [subsequences, setSubsequences] = useState<SubsequenceDraft[]>(INITIAL_SUBSEQUENCES);
  const [isSubsequenceDialogOpen, setIsSubsequenceDialogOpen] = useState(false);
  const [subsequenceStep, setSubsequenceStep] = useState<1 | 2>(1);
  const [subsequenceName, setSubsequenceName] = useState("");
  const [subsequenceConditionType, setSubsequenceConditionType] = useState("reply_not_received");
  const [subsequenceConditionValue, setSubsequenceConditionValue] = useState("3");

  const sendingDaySet = useMemo(() => new Set(sendingDays), [sendingDays]);
  const leads = useMemo(() => {
    return allLeads.filter((lead) => {
      if (leadStatusFilter !== "all" && lead.status.toLowerCase() !== leadStatusFilter) return false;
      if (leadTagFilter !== "all" && lead.tag.toLowerCase() !== leadTagFilter) return false;
      if (leadSearch.trim()) {
        const haystack = `${lead.name} ${lead.email} ${lead.company}`.toLowerCase();
        if (!haystack.includes(leadSearch.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [allLeads, leadSearch, leadStatusFilter, leadTagFilter]);

  const totalSent = sequenceSteps.reduce((sum, step) => sum + step.sent, 0);
  const quickLeadContext = leads.slice(0, 6);
  const selectedSequenceStep =
    sequenceSteps.find((step) => step.id === selectedSequenceStepId) || sequenceSteps[0] || null;
  const selectedSequenceIndex = selectedSequenceStep
    ? sequenceSteps.findIndex((step) => step.id === selectedSequenceStep.id)
    : -1;
  const sequenceVariables = [
    "{{first_name}}",
    "{{last_name}}",
    "{{company}}",
    "{{title}}",
    "{{industry}}",
    "{{website}}",
  ];
  const {
    messages: sequenceAgentMessages,
    isStreaming: isSequenceAgentStreaming,
    sendMessage: sendSequenceAgentMessage,
  } = useStreamingChat({
    companyId: companyId || "",
    sessionType: "campaigns",
    onError: (chatError) => setSequenceAgentError(chatError.message),
  });

  useEffect(() => {
    sequenceAgentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sequenceAgentMessages]);

  const savePatch = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/plusvibe/campaigns/${campaign.id}${companyQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed to save campaign changes" }));
        throw new Error(data.error || data.details || "Failed to save campaign changes");
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign changes");
    } finally {
      setSaving(false);
    }
  };

  const updateSequenceStep = (
    stepId: string,
    patch: Partial<Pick<SequenceStepDraft, "subject" | "body" | "waitDays">>
  ) => {
    setSequenceSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step)));
  };

  const addSequenceStep = () => {
    const stepId = `step-${Date.now()}`;
    setSequenceSteps((prev) => [
      ...prev,
      {
        id: stepId,
        title: `Step ${prev.length + 1} - New step`,
        subject: "New follow-up subject",
        body: "Write your follow-up message...",
        waitDays: 3,
        sent: 0,
        openRate: 0,
        replyRate: 0,
        positiveRate: 0,
      },
    ]);
    setSelectedSequenceStepId(stepId);
  };

  const saveSequences = () => {
    void savePatch({
      sequence: sequenceSteps.map((step, index) => ({
        step: index + 1,
        subject: step.subject,
        body: step.body,
        delay_days: step.waitDays,
      })),
    });
  };

  const resetSubsequenceWizard = () => {
    setSubsequenceStep(1);
    setSubsequenceName("");
    setSubsequenceConditionType("reply_not_received");
    setSubsequenceConditionValue("3");
  };

  const saveSubsequence = async () => {
    if (!subsequenceName.trim()) return;
    const draft: SubsequenceDraft = {
      id: `${Date.now()}`,
      name: subsequenceName.trim(),
      conditionType: subsequenceConditionType,
      conditionValue: subsequenceConditionValue,
      status: "Draft",
    };
    setSubsequences((prev) => [draft, ...prev]);
    await savePatch({
      action: "add_subsequence",
      subsequence: {
        name: draft.name,
        condition_type: draft.conditionType,
        condition_value: draft.conditionValue,
      },
    });
    setIsSubsequenceDialogOpen(false);
    resetSubsequenceWizard();
  };

  const handleSequenceAgentSend = async () => {
    const message = sequenceAgentInput.trim();
    if (!message || isSequenceAgentStreaming || !companyId) return;
    setSequenceAgentError(null);
    setSequenceAgentInput("");

    await sendSequenceAgentMessage(message, {
      component: "campaign_sequences",
      data: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        selectedStep: selectedSequenceStep
          ? {
              id: selectedSequenceStep.id,
              title: selectedSequenceStep.title,
              subject: selectedSequenceStep.subject,
              waitDays: selectedSequenceStep.waitDays,
            }
          : null,
        leadsSnapshot: quickLeadContext.map((lead) => ({
          id: lead.id,
          name: lead.name,
          company: lead.company,
          status: lead.status,
          step: lead.step,
        })),
      },
    });
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">{campaign.name}</h2>
            <p className="text-sm text-muted-foreground">Campaign Builder</p>
          </div>
        </div>
        <Badge variant="outline" className="capitalize">
          {campaign.status || "Draft"}
        </Badge>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Leads</p>
            <p className="text-xl font-semibold text-foreground mt-1">{campaign.stats?.leadCount || leads.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Emails Sent</p>
            <p className="text-xl font-semibold text-foreground mt-1">{totalSent.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Reply Rate</p>
            <p className="text-xl font-semibold text-foreground mt-1">{campaign.stats?.replyRate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Positive Rate</p>
            <p className="text-xl font-semibold text-foreground mt-1">{campaign.stats?.positiveRate || 0}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-5">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="subsequences">Subsequences</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Leads
              </CardTitle>
            </CardHeader>
            <CardContent className="w-full min-w-0 max-w-full space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
                <select
                  value={leadStatusFilter}
                  onChange={(event) => setLeadStatusFilter(event.target.value)}
                  className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm xl:col-span-2"
                >
                  <option value="all">All statuses</option>
                  <option value="ready">Ready</option>
                  <option value="contacted">Contacted</option>
                  <option value="replied">Replied</option>
                  <option value="bounced">Bounced</option>
                </select>
                <select
                  value={leadTagFilter}
                  onChange={(event) => setLeadTagFilter(event.target.value)}
                  className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm xl:col-span-2"
                >
                  <option value="all">All tags</option>
                  <option value="icp-a">ICP-A</option>
                  <option value="icp-b">ICP-B</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="smb">SMB</option>
                </select>
                <div className="relative min-w-0 md:col-span-2 xl:col-span-5">
                  <Search className="h-4 w-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 left-3" />
                  <Input
                    className="w-full min-w-0 pl-9"
                    placeholder="Search leads..."
                    value={leadSearch}
                    onChange={(event) => setLeadSearch(event.target.value)}
                  />
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-2 md:col-span-2 xl:col-span-3">
                  <Button
                    variant="outline"
                    className="w-full min-w-0 gap-1"
                    onClick={handleImportLeads}
                    disabled={importingLeads}
                  >
                    {importingLeads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                    Import
                  </Button>
                  <Button className="w-full min-w-0 gap-1" onClick={() => setIsAddLeadOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>

              <div className="max-w-full rounded-lg border border-border overflow-hidden">
                <div className="w-full max-w-full overflow-x-auto">
                  <table className="w-full min-w-[860px] table-fixed text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-[16%]">Lead</th>
                      <th className="text-left px-3 py-2 font-medium w-[20%]">Email</th>
                      <th className="text-left px-3 py-2 font-medium w-[16%]">Company</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-left px-3 py-2 font-medium">Tag</th>
                      <th className="text-left px-3 py-2 font-medium">Step</th>
                      <th className="text-left px-3 py-2 font-medium">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground truncate">{lead.name}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate">{lead.email}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate">{lead.company}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{lead.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{lead.tag}</td>
                        <td className="px-3 py-2 text-muted-foreground">{lead.step}</td>
                        <td className="px-3 py-2 text-muted-foreground">{lead.lastActivity}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing {leads.length} of {allLeads.length} leads
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sequences" className="mt-4">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4" />
                Sequences
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1">
                  <Settings2 className="h-4 w-4" />
                  Analytics, Steps & Variations
                </Button>
                <Button onClick={addSequenceStep} size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Step
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 bg-muted/10 p-3 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
              <aside className="space-y-3 rounded-md border border-border bg-card p-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sequences</p>
                  <div className="mt-2 space-y-2">
                    {sequenceSteps.map((step, index) => {
                      const isSelected = step.id === selectedSequenceStep?.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setSelectedSequenceStepId(step.id)}
                          className={`w-full rounded-md border p-3 text-left transition-colors ${
                            isSelected
                              ? "border-primary/40 bg-primary/10"
                              : "border-border bg-card hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">Step {index + 1}</p>
                            <span className="text-[11px] text-muted-foreground">{step.sent} sent</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{step.subject}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {index === 0 ? "Initial email" : `Wait ${step.waitDays} days`} · 1 variation
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Variables
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sequenceVariables.map((variable) => (
                      <Badge key={variable} variant="outline" className="text-[11px]">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="space-y-4 rounded-md border border-border bg-card p-4">
                {selectedSequenceStep ? (
                  <>
                    <div className="rounded-md border border-border bg-background">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                        <p className="text-sm font-medium text-foreground">
                          {selectedSequenceStep.title}
                        </p>
                        <Badge variant="outline" className="text-[11px]">
                          {selectedSequenceStep.sent} sent
                        </Badge>
                      </div>

                      <div className="space-y-3 p-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Subject
                          </label>
                          <Input
                            value={selectedSequenceStep.subject}
                            onChange={(event) =>
                              updateSequenceStep(selectedSequenceStep.id, { subject: event.target.value })
                            }
                          />
                        </div>

                        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/20 p-1">
                          {[Bold, Italic, Underline, Link2, List, ListOrdered, Quote].map((Icon, idx) => (
                            <Button key={idx} type="button" size="icon" variant="ghost" className="h-8 w-8">
                              <Icon className="h-4 w-4" />
                            </Button>
                          ))}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Body
                          </label>
                          <textarea
                            value={selectedSequenceStep.body}
                            onChange={(event) =>
                              updateSequenceStep(selectedSequenceStep.id, { body: event.target.value })
                            }
                            rows={14}
                            className="min-h-[280px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-y"
                          />
                        </div>
                      </div>
                    </div>

                    {selectedSequenceIndex > 0 ? (
                      <div className="max-w-xs">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Wait Days</label>
                        <Input
                          type="number"
                          min={1}
                          value={selectedSequenceStep.waitDays}
                          onChange={(event) =>
                            updateSequenceStep(selectedSequenceStep.id, {
                              waitDays: Number(event.target.value) || 1,
                            })
                          }
                        />
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                      <div className="rounded-md border border-border bg-muted/30 p-2">
                        <p className="text-muted-foreground">Open Rate</p>
                        <p className="text-foreground font-semibold">{selectedSequenceStep.openRate}%</p>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-2">
                        <p className="text-muted-foreground">Reply Rate</p>
                        <p className="text-foreground font-semibold">{selectedSequenceStep.replyRate}%</p>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-2">
                        <p className="text-muted-foreground">Positive Rate</p>
                        <p className="text-foreground font-semibold">{selectedSequenceStep.positiveRate}%</p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={saveSequences} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save Sequence
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No steps yet. Add a step to start building.</p>
                )}
              </div>

              <div className="flex min-h-[560px] flex-col rounded-md border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Bot className="h-4 w-4 text-primary" />
                    Sequence Agent
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {isSequenceAgentStreaming ? "Thinking..." : "Ready"}
                  </Badge>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {!companyId ? (
                    <p className="text-sm text-muted-foreground">Select a company to activate the Sequence agent.</p>
                  ) : sequenceAgentMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Ask the agent to rewrite this step, suggest variants, or adjust timing for your selected leads.
                    </p>
                  ) : (
                    sequenceAgentMessages.map((message) => (
                      <ChatMessage
                        key={message.id}
                        message={{
                          id: message.id,
                          role: message.role,
                          content: message.content,
                          timestamp: message.timestamp,
                          isThinking: message.isStreaming,
                          toolCalls: message.toolCalls,
                          tasks: message.tasks as any,
                          reasoning: message.reasoning,
                          reasoningDuration: message.reasoningDuration,
                        }}
                      />
                    ))
                  )}
                  <div ref={sequenceAgentEndRef} />
                </div>

                {sequenceAgentError ? (
                  <p className="border-t border-border px-3 py-2 text-xs text-destructive">{sequenceAgentError}</p>
                ) : null}

                <div className="border-t border-border p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={sequenceAgentInput}
                      onChange={(event) => setSequenceAgentInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSequenceAgentSend();
                        }
                      }}
                      placeholder="Ask Sequence Agent..."
                      rows={2}
                      className="min-h-[70px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => void handleSequenceAgentSend()}
                      disabled={!companyId || !sequenceAgentInput.trim() || isSequenceAgentStreaming}
                    >
                      {isSequenceAgentStreaming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <Input type="time" value={startHour} onChange={(event) => setStartHour(event.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <Input type="time" value={endHour} onChange={(event) => setEndHour(event.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Sending Days</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={sendingDaySet.has(day) ? "default" : "outline"}
                      onClick={() =>
                        setSendingDays((prev) =>
                          prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
                        )
                      }
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium">Daily Sending Limit</label>
                  <Input
                    type="number"
                    min={1}
                    value={dailyLimit}
                    onChange={(event) => setDailyLimit(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Min Delay Between Sends (min)</label>
                  <Input
                    type="number"
                    min={0}
                    value={minDelayMinutes}
                    onChange={(event) => setMinDelayMinutes(event.target.value)}
                  />
                </div>
                <div className="rounded-md border border-border px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  Recommended window: 09:00 - 17:00
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    savePatch({
                      timezone,
                      daily_limit: Number(dailyLimit) || 0,
                      schedule: {
                        start_time: startHour,
                        end_time: endHour,
                        days: sendingDays,
                        min_delay_minutes: Number(minDelayMinutes) || 0,
                      },
                    })
                  }
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm font-medium">Campaign Name</label>
                <Input
                  value={settingsName}
                  onChange={(event) => setSettingsName(event.target.value)}
                  placeholder="Campaign name"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Sender Pool</label>
                <select
                  value={selectedSenderPool}
                  onChange={(event) => setSelectedSenderPool(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="Primary Senders">Primary Senders</option>
                  <option value="Warmup Safe Pool">Warmup Safe Pool</option>
                  <option value="Enterprise Split Pool">Enterprise Split Pool</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Track Opens
                  </span>
                  <Switch checked={trackOpens} onCheckedChange={setTrackOpens} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Reply className="h-4 w-4 text-muted-foreground" />
                    Track Clicks
                  </span>
                  <Switch checked={trackClicks} onCheckedChange={setTrackClicks} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Reply className="h-4 w-4 text-muted-foreground" />
                    Stop on Reply
                  </span>
                  <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                    Unsubscribe Footer
                  </span>
                  <Switch checked={unsubscribeFooter} onCheckedChange={setUnsubscribeFooter} />
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    savePatch({
                      camp_name: settingsName.trim(),
                      sender_pool: selectedSenderPool,
                      daily_limit: Number(dailyLimit) || 0,
                      tracking: {
                        opens: trackOpens,
                        clicks: trackClicks,
                      },
                      stop_on_reply: stopOnReply,
                      unsubscribe_footer: unsubscribeFooter,
                    })
                  }
                  disabled={saving || !settingsName.trim()}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subsequences" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Subsequences</CardTitle>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => {
                  resetSubsequenceWizard();
                  setIsSubsequenceDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Subsequence
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {subsequences.map((subsequence) => (
                <div key={subsequence.id} className="rounded-md border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{subsequence.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Condition: {subsequence.conditionType} ({subsequence.conditionValue} days)
                    </p>
                  </div>
                  <Badge variant="outline">{subsequence.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>
              Add a new lead to this campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Full name"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email *</label>
              <Input
                type="email"
                placeholder="email@company.com"
                value={newLeadEmail}
                onChange={(e) => setNewLeadEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Company</label>
              <Input
                placeholder="Company name"
                value={newLeadCompany}
                onChange={(e) => setNewLeadCompany(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Job title"
                value={newLeadTitle}
                onChange={(e) => setNewLeadTitle(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLeadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddLead} disabled={addingLead || !newLeadEmail.trim()}>
              {addingLead ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSubsequenceDialogOpen} onOpenChange={setIsSubsequenceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subsequence</DialogTitle>
            <DialogDescription>
              {subsequenceStep === 1
                ? "Step 1 of 2: Name your subsequence."
                : "Step 2 of 2: Choose a trigger condition."}
            </DialogDescription>
          </DialogHeader>

          {subsequenceStep === 1 ? (
            <Input
              placeholder="Subsequence name"
              value={subsequenceName}
              onChange={(event) => setSubsequenceName(event.target.value)}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Condition</label>
                <select
                  value={subsequenceConditionType}
                  onChange={(event) => setSubsequenceConditionType(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="reply_not_received">No reply received</option>
                  <option value="opened_not_replied">Opened but not replied</option>
                  <option value="link_not_clicked">Link not clicked</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">After (days)</label>
                <Input
                  type="number"
                  min={1}
                  value={subsequenceConditionValue}
                  onChange={(event) => setSubsequenceConditionValue(event.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (subsequenceStep === 1) {
                  setIsSubsequenceDialogOpen(false);
                } else {
                  setSubsequenceStep(1);
                }
              }}
            >
              {subsequenceStep === 1 ? "Cancel" : "Back"}
            </Button>
            {subsequenceStep === 1 ? (
              <Button onClick={() => setSubsequenceStep(2)} disabled={!subsequenceName.trim()}>
                Next
              </Button>
            ) : (
              <Button onClick={saveSubsequence} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
