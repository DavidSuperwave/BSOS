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
import {
  type PlusVibeCampaign,
  useCampaignLeads,
  type CampaignLead,
  useCampaignDetails,
  usePlusVibeAccounts,
  type PlusVibeAccount,
} from "@/lib/hooks";
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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_TO_INDEX: Record<string, string> = {
  Mon: "1",
  Tue: "2",
  Wed: "3",
  Thu: "4",
  Fri: "5",
  Sat: "6",
  Sun: "7",
};

function createEmptySequenceStep(index: number): SequenceStepDraft {
  return {
    id: `step-${Date.now()}-${index}`,
    title: `Step ${index + 1}`,
    subject: "",
    body: "",
    waitDays: index === 0 ? 1 : 3,
    sent: 0,
    openRate: 0,
    replyRate: 0,
    positiveRate: 0,
  };
}

function mapScheduleDaysToLabels(days?: Record<string, boolean> | string[]) {
  if (Array.isArray(days)) {
    const normalized = new Set(
      days
        .map((value) => String(value || "").slice(0, 3).toLowerCase())
        .filter(Boolean)
    );
    const labels = DAY_LABELS.filter((day) =>
      normalized.has(day.slice(0, 3).toLowerCase())
    );
    return labels.length > 0 ? labels : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  }
  if (!days || typeof days !== "object") return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const labels = DAY_LABELS.filter((day) => Boolean((days as Record<string, boolean>)[DAY_TO_INDEX[day]]));
  return labels.length > 0 ? labels : ["Mon", "Tue", "Wed", "Thu", "Fri"];
}

function mapLabelsToScheduleDays(labels: string[]) {
  return {
    "1": labels.includes("Mon"),
    "2": labels.includes("Tue"),
    "3": labels.includes("Wed"),
    "4": labels.includes("Thu"),
    "5": labels.includes("Fri"),
    "6": labels.includes("Sat"),
    "7": labels.includes("Sun"),
  };
}

function accountLabel(account: PlusVibeAccount) {
  return account.email || account.id;
}

function pickBestVariation(step: any) {
  if (!Array.isArray(step?.variations) || step.variations.length === 0) return undefined;
  const firstWithCopy = step.variations.find((variation: any) => {
    const subject = String(variation?.subject || "").trim();
    const body = String(variation?.body || "").trim();
    return subject.length > 0 || body.length > 0;
  });
  return firstWithCopy || step.variations[0];
}

function normalizeTemplatePreview(text: string) {
  if (!text) return "";
  return text
    .replace(/\{\{\s*random\|([^}]+)\}\}/gi, (_, variants: string) => {
      const [first] = String(variants || "").split("|");
      return first || "";
    })
    .replace(/\{\{\s*(first_name|fname)\s*\}\}/gi, "there")
    .replace(/\{\{\s*(last_name|lname)\s*\}\}/gi, "")
    .replace(/\{\{\s*company_name\s*\}\}/gi, "your company")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHookErrorMessage(error: unknown, fallback: string) {
  const anyError = error as any;
  return (
    anyError?.info?.details ||
    anyError?.info?.error ||
    anyError?.message ||
    fallback
  );
}

const INITIAL_SCHEDULE_DATE = new Date().toISOString().slice(0, 10);

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

  // Real lead data and campaign config from PlusVibe
  const {
    data: campaignDetailsData,
    isLoading: campaignDetailsLoading,
    error: campaignDetailsError,
  } = useCampaignDetails(
    campaign.id,
    companyId
  );
  const {
    data: accountData,
    isLoading: accountsLoading,
    error: accountsError,
  } = usePlusVibeAccounts(companyId);
  const {
    data: leadData,
    mutate: mutateLeads,
    isLoading: leadsLoading,
    error: leadsError,
  } = useCampaignLeads(campaign.id, companyId);
  const availableAccounts = useMemo(
    () => accountData?.accounts || [],
    [accountData?.accounts]
  );
  const allLeads: CampaignLead[] = useMemo(
    () => leadData?.leads || [],
    [leadData?.leads]
  );

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

  const [sequenceSteps, setSequenceSteps] = useState<SequenceStepDraft[]>([]);
  const [selectedSequenceStepId, setSelectedSequenceStepId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [campaignStatus, setCampaignStatus] = useState(campaign.status || "DRAFT");

  const [settingsName, setSettingsName] = useState(campaign.name || "");
  const [dailyLimit, setDailyLimit] = useState("200");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(true);
  const [selectedSenderPool, setSelectedSenderPool] = useState("Primary Senders");

  const [timezone, setTimezone] = useState("America/New_York");
  const [scheduleStartDate, setScheduleStartDate] = useState(INITIAL_SCHEDULE_DATE);
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
  const expectedLeadCount = Number(campaign.stats?.leadCount || 0);
  const hasLeadCountGap = expectedLeadCount > 0 && allLeads.length === 0;
  const isArchivedCampaign = String(campaignStatus || campaign.status || "")
    .toUpperCase()
    .includes("ARCHIVED");
  const leadWarning =
    hasLeadCountGap && !leadsLoading
      ? isArchivedCampaign
        ? "PlusVibe reports leads for this campaign, but archived campaigns do not expose individual lead rows via workspace-leads."
        : "PlusVibe reports leads for this campaign, but no lead rows were returned. This is usually an upstream indexing lag."
      : null;
  const quickLeadContext = leads.slice(0, 6);
  const selectedSequenceStep =
    sequenceSteps.find((step) => step.id === selectedSequenceStepId) || sequenceSteps[0] || null;
  const selectedSequenceIndex = selectedSequenceStep
    ? sequenceSteps.findIndex((step) => step.id === selectedSequenceStep.id)
    : -1;
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

  useEffect(() => {
    const details = campaignDetailsData?.campaign;
    if (!details) return;

    setSettingsName(details.name || campaign.name || "");
    setCampaignStatus(String(details.status || campaign.status || "DRAFT"));

    const hydratedSequences = Array.isArray(details.sequences)
      ? details.sequences.map((step, index) => {
          const variation = pickBestVariation(step);
          return {
            id: `step-${step.step || index + 1}`,
            title: variation?.name || `Step ${step.step || index + 1}`,
            subject: variation?.subject || "",
            body: variation?.body || "",
            waitDays: Number(step.wait_time || 1),
            sent: 0,
            openRate: 0,
            replyRate: 0,
            positiveRate: 0,
          };
        })
      : [];
    const safeSequences = hydratedSequences.length > 0 ? hydratedSequences : [createEmptySequenceStep(0)];
    setSequenceSteps(safeSequences);
    setSelectedSequenceStepId((current) => current || safeSequences[0]?.id || "");

    const schedule = Array.isArray(details.schedules) ? details.schedules[0] : undefined;
    if (schedule) {
      setDailyLimit(String(schedule.daily_limit || 25));
      setTimezone(schedule.timezone || schedule.tz || "America/New_York");
      setScheduleStartDate(schedule.start_date || INITIAL_SCHEDULE_DATE);
      setStartHour(schedule.timing?.from || schedule.from_time || "09:00");
      setEndHour(schedule.timing?.to || schedule.to_time || "17:00");
      setSendingDays(mapScheduleDaysToLabels(schedule.days));
    }

    setSelectedAccountIds(
      Array.isArray(details.email_accounts)
        ? Array.from(new Set(details.email_accounts.map((value) => String(value))))
        : []
    );
  }, [campaign.id, campaign.name, campaign.status, campaignDetailsData?.campaign]);

  useEffect(() => {
    setCampaignStatus(campaign.status || "DRAFT");
  }, [campaign.id, campaign.status]);

  useEffect(() => {
    if (selectedSequenceStepId || sequenceSteps.length === 0) return;
    setSelectedSequenceStepId(sequenceSteps[0]?.id || "");
  }, [selectedSequenceStepId, sequenceSteps]);

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
    const stepId = `step-${Date.now()}-${sequenceSteps.length + 1}`;
    setSequenceSteps((prev) => [...prev, { ...createEmptySequenceStep(prev.length), id: stepId }]);
    setSelectedSequenceStepId(stepId);
  };

  const saveSequences = () => {
    if (sequenceSteps.length === 0) {
      setError("Add at least one sequence step before saving.");
      return;
    }
    void savePatch({
      first_wait_time: 0,
      sequences: sequenceSteps.map((step, index) => ({
        step: index + 1,
        wait_time: Math.max(1, Number(step.waitDays) || 1),
        variations: [
          {
            variation: "A",
            name: step.title || `Step ${index + 1}`,
            subject: step.subject || "",
            body: step.body || "",
          },
        ],
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

  const accountSummary = useMemo(() => {
    const byEsp = {
      gmail: availableAccounts.filter((account) => account.esp === "gmail").length,
      microsoft: availableAccounts.filter((account) => account.esp === "microsoft").length,
      smtp: availableAccounts.filter((account) => account.esp === "smtp").length,
    };
    const byDomain = new Map<string, { users: number; managed: boolean }>();
    for (const account of availableAccounts) {
      if (!account.domain) continue;
      const current = byDomain.get(account.domain);
      if (!current) {
        byDomain.set(account.domain, {
          users: 1,
          managed: account.is_managed_domain,
        });
      } else {
        current.users += 1;
        current.managed = current.managed || account.is_managed_domain;
      }
    }
    return {
      byEsp,
      domainCount: byDomain.size,
      domainRows: Array.from(byDomain.entries())
        .map(([domain, value]) => ({ domain, users: value.users, managed: value.managed }))
        .sort((a, b) => a.domain.localeCompare(b.domain)),
    };
  }, [availableAccounts]);

  const runCampaignLifecycleAction = async (action: "activate" | "pause") => {
    setSaving(true);
    setError(null);
    try {
      const endpoint =
        action === "activate"
          ? `/api/plusvibe/campaigns/${campaign.id}/activate${companyQuery}`
          : `/api/plusvibe/campaigns/${campaign.id}/pause${companyQuery}`;
      const response = await fetch(endpoint, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed campaign action" }));
        throw new Error(data.error || data.details || "Failed campaign action");
      }
      setCampaignStatus(action === "activate" ? "ACTIVE" : "PAUSED");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed campaign action");
    } finally {
      setSaving(false);
    }
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runCampaignLifecycleAction("pause")}
            disabled={saving}
          >
            Pause
          </Button>
          <Button
            size="sm"
            onClick={() => void runCampaignLifecycleAction("activate")}
            disabled={saving}
          >
            Activate
          </Button>
          <Badge variant="outline" className="capitalize">
            {(campaignStatus || "Draft").toLowerCase()}
          </Badge>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {campaignDetailsLoading ? (
        <p className="text-sm text-muted-foreground">Loading campaign configuration…</p>
      ) : null}

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
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 lg:grid-cols-6">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="accounts">Inboxes</TabsTrigger>
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

              {leadsError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {resolveHookErrorMessage(leadsError, "Failed to load campaign leads.")}
                </div>
              ) : null}

              {leadWarning ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {leadWarning}
                </div>
              ) : null}

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
          {campaignDetailsError ? (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {resolveHookErrorMessage(campaignDetailsError, "Failed to load campaign sequence details.")}
            </div>
          ) : null}
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

            <div className="grid grid-cols-1 gap-3 border-b border-border bg-muted/10 p-3">
              <div className="flex min-h-[280px] flex-col rounded-md border border-border bg-card">
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

            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="border-b border-border bg-muted/20 p-3 lg:border-b-0 lg:border-r">
                <div className="space-y-2">
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
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {normalizeTemplatePreview(step.body || step.subject) || "No copy yet"}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {index === 0 ? "Initial email" : `Wait ${step.waitDays} days`} · 1 variation
                        </p>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="space-y-4 p-4">
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={scheduleStartDate}
                    onChange={(event) => setScheduleStartDate(event.target.value)}
                  />
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
                  {DAY_LABELS.map((day) => (
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
                      first_wait_time: 0,
                      schedules: [
                        {
                          daily_limit: Number(dailyLimit) || 25,
                          start_date: scheduleStartDate || INITIAL_SCHEDULE_DATE,
                          days: mapLabelsToScheduleDays(sendingDays),
                          timezone,
                          timing: {
                            from: startHour,
                            to: endHour,
                          },
                        },
                      ],
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

        <TabsContent value="accounts" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Sender Inboxes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {accountsError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {resolveHookErrorMessage(accountsError, "Failed to load workspace inboxes.")}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Accounts</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{availableAccounts.length}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Domains</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{accountSummary.domainCount}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Gmail</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{accountSummary.byEsp.gmail}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Microsoft</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{accountSummary.byEsp.microsoft}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">SMTP</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{accountSummary.byEsp.smtp}</p>
                </div>
              </div>

              {accountSummary.domainRows.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Domain</th>
                        <th className="p-2 text-left">Users</th>
                        <th className="p-2 text-left">Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountSummary.domainRows.map((row) => (
                        <tr key={row.domain} className="border-t border-border">
                          <td className="p-2 text-foreground">{row.domain}</td>
                          <td className="p-2 text-muted-foreground">{row.users}</td>
                          <td className="p-2">
                            <Badge
                              variant="outline"
                              className={row.managed ? "text-emerald-700" : "text-amber-700"}
                            >
                              {row.managed ? "Managed Domain" : "External Provider"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {accountsLoading ? (
                <p className="text-sm text-muted-foreground">Loading inbox accounts…</p>
              ) : availableAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No PlusVibe accounts found in this workspace. Add inboxes in PlusVibe first.
                </p>
              ) : (
                <div className="max-h-[360px] overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 text-left w-10"> </th>
                        <th className="p-3 text-left">Inbox</th>
                        <th className="p-3 text-left">Domain</th>
                        <th className="p-3 text-left">ESP</th>
                        <th className="p-3 text-left">Domain Access</th>
                        <th className="p-3 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableAccounts.map((account) => {
                        const selected = selectedAccountIds.includes(account.id);
                        const limited = account.provider_access === "external_provider";
                        return (
                          <tr key={account.id} className="border-t border-border">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={limited}
                                onChange={(event) =>
                                  setSelectedAccountIds((prev) => {
                                    if (event.target.checked) {
                                      return Array.from(new Set([...prev, account.id]));
                                    }
                                    return prev.filter((value) => value !== account.id);
                                  })
                                }
                              />
                            </td>
                            <td className="p-3 text-foreground">{accountLabel(account)}</td>
                            <td className="p-3 text-xs text-muted-foreground">{account.domain || "—"}</td>
                            <td className="p-3 uppercase text-xs text-muted-foreground">{account.esp}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={limited ? "text-amber-700" : "text-emerald-700"}>
                                {limited ? "External Provider" : "Managed Domain"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">{account.status || "unknown"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                External providers are import-only. Agent automation is restricted unless the domain is managed in our inboxing account.
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Transfer to managed inboxing is coming soon. Until then, external-provider inboxes remain read-only for agent actions.
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    savePatch({
                      first_wait_time: 0,
                      email_accounts: selectedAccountIds,
                    })
                  }
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Inboxes
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
