"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Filter,
  Loader2,
  Mail,
  Plus,
  Reply,
  Search,
  Send,
  Settings2,
  ThumbsUp,
  Users,
} from "lucide-react";
import { type PlusVibeCampaign, useCampaignLeads, type CampaignLead } from "@/lib/hooks";
import { useStreamingChat } from "@/lib/hooks/use-streaming-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface SequenceVariation {
  id: string;
  label: string;
  name: string;
  subject: string;
  body: string;
}

interface SubsequenceDraft {
  id: string;
  name: string;
  conditionType: string;
  conditionValue: string;
  status: "Active" | "Draft";
}

const LEADS_PAGE_SIZE = 25;

function toStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBooleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (["yes", "true", "1", "on"].includes(normalized)) return true;
    if (["no", "false", "0", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function coerceArray(input: unknown): any[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const nested = [record.steps, record.sequences, record.sequence, record.data, record.value];
    for (const candidate of nested) {
      if (Array.isArray(candidate)) return candidate;
    }
  }
  return [];
}

function extractRawSequenceSteps(campaign: PlusVibeCampaign): any[] {
  const candidates = [
    campaign.sequences,
    campaign.sequence,
    (campaign as any)?.settings?.sequences,
    (campaign as any)?.campaign?.sequences,
    (campaign as any)?.steps,
  ];

  for (const candidate of candidates) {
    const rawSteps = coerceArray(candidate);
    if (rawSteps.length > 0) return rawSteps;
  }

  return [];
}

function getFallbackSequenceStep(): SequenceStepDraft {
  return {
    id: "step-1",
    title: "Step 1",
    subject: "",
    body: "",
    waitDays: 0,
    sent: 0,
    openRate: 0,
    replyRate: 0,
    positiveRate: 0,
  };
}

function normalizeSequenceSteps(campaign: PlusVibeCampaign): SequenceStepDraft[] {
  const rawSteps = extractRawSequenceSteps(campaign);

  if (rawSteps.length === 0) return [getFallbackSequenceStep()];

  const normalized = rawSteps.map((step: any, index: number) => {
    const stepNumber = toNumberValue(step?.step, index + 1);
    const delayDaysRaw = step?.delay_days ?? step?.wait_days ?? step?.waitDays ?? step?.delay;
    const delayDays = toNumberValue(delayDaysRaw, index === 0 ? 0 : 3);

    return {
      id: toStringValue(step?.id, step?._id, `step-${stepNumber}`),
      title: toStringValue(step?.title, step?.name, `Step ${stepNumber}`),
      subject: toStringValue(
        step?.variations?.[0]?.subject,
        step?.subject,
        step?.subject_line,
        step?.email_subject,
        step?.email?.subject,
        step?.mail?.subject
      ),
      body: toStringValue(
        step?.variations?.[0]?.body,
        step?.body,
        step?.message,
        step?.content,
        step?.email_body,
        step?.email?.body,
        step?.mail?.body
      ),
      waitDays: delayDays < 0 ? 0 : delayDays,
      sent: toNumberValue(step?.sent ?? step?.emails_sent ?? step?.sent_count, 0),
      openRate: toNumberValue(step?.open_rate ?? step?.openRate, 0),
      replyRate: toNumberValue(step?.reply_rate ?? step?.replyRate, 0),
      positiveRate: toNumberValue(step?.positive_rate ?? step?.positiveRate, 0),
    };
  });

  return normalized.length > 0 ? normalized : [getFallbackSequenceStep()];
}

function normalizeVariationArray(step: Record<string, any>, stepIndex: number): SequenceVariation[] {
  const variations = Array.isArray(step?.variations) ? step.variations : [];
  if (variations.length === 0) {
    const fallbackStep = normalizeSequenceSteps({
      ...step,
      sequences: [step],
      id: step?.id || `step-${stepIndex + 1}`,
      name: step?.name || step?.title,
      status: "draft",
      createdAt: new Date().toISOString(),
    } as PlusVibeCampaign)[0];
    return buildDefaultVariationsForStep(fallbackStep, stepIndex);
  }

  return variations.map((variation: Record<string, any>, variationIndex: number) => ({
    id: toStringValue(
      variation?.id,
      variation?._id,
      `${toStringValue(step?.id, step?._id, `step-${stepIndex + 1}`)}-var-${variationIndex + 1}`
    ),
    label: toStringValue(
      variation?.variation,
      variation?.label,
      variationLabelAt(variationIndex)
    ),
    name: toStringValue(
      variation?.name,
      variation?.title,
      `Variation Name ${stepIndex + 1}${variationLabelAt(variationIndex)}`
    ),
    subject: toStringValue(variation?.subject),
    body: toStringValue(variation?.body, variation?.content, variation?.message),
  }));
}

function buildSequenceEditorState(campaign: PlusVibeCampaign) {
  const steps = normalizeSequenceSteps(campaign);
  const rawSteps = extractRawSequenceSteps(campaign);
  const stepVariations: Record<string, SequenceVariation[]> = {};
  const activeVariationByStep: Record<string, string> = {};

  steps.forEach((step, index) => {
    const rawStep = rawSteps[index] || {};
    const variations = normalizeVariationArray(rawStep, index);
    stepVariations[step.id] = variations;
    activeVariationByStep[step.id] = variations[0]?.id || "";
  });

  return {
    steps,
    stepVariations,
    activeVariationByStep,
  };
}

function normalizeScheduleDays(days: unknown): string[] {
  const dayMap: Record<string, string> = {
    "1": "Mon",
    "2": "Tue",
    "3": "Wed",
    "4": "Thu",
    "5": "Fri",
    "6": "Sat",
    "7": "Sun",
  };

  if (Array.isArray(days)) {
    const normalized = days
      .map((day) => String(day || "").slice(0, 3))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  }

  if (days && typeof days === "object") {
    const normalized = Object.entries(days as Record<string, unknown>)
      .filter(([, enabled]) => toBooleanValue(enabled, false))
      .map(([day]) => dayMap[day] || day.slice(0, 3));
    return normalized.length > 0 ? normalized : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  }

  return ["Mon", "Tue", "Wed", "Thu", "Fri"];
}

function extractScheduleSettings(campaign: PlusVibeCampaign) {
  const schedule = ((campaign as any)?.schedules || (campaign as any)?.schedule || {}) as Record<string, any>;
  return {
    dailyLimit: String(schedule?.daily_limit ?? (campaign as any)?.daily_limit ?? 200),
    timezone: toStringValue(schedule?.timezone, (campaign as any)?.timezone, "America/New_York"),
    startHour: toStringValue(schedule?.timing?.from, schedule?.start_time, "09:00"),
    endHour: toStringValue(schedule?.timing?.to, schedule?.end_time, "17:00"),
    sendingDays: normalizeScheduleDays(schedule?.days),
    minDelayMinutes: String(schedule?.min_delay_minutes ?? (campaign as any)?.interval_limit_in_min ?? 2),
    scheduleName: toStringValue(schedule?.name, "New schedule"),
  };
}

function extractCampaignSettings(campaign: PlusVibeCampaign) {
  const scheduleSettings = extractScheduleSettings(campaign);
  return {
    name: campaign.name || "",
    dailyLimit: scheduleSettings.dailyLimit,
    trackOpens: toBooleanValue((campaign as any)?.is_emailopened_tracking, true),
    trackClicks: true,
    stopOnReply: toBooleanValue((campaign as any)?.stop_on_lead_replied, true),
    unsubscribeFooter: toBooleanValue((campaign as any)?.is_unsubscribed_link, true),
    selectedSenderPool: toStringValue((campaign as any)?.sender_pool, "Primary Senders"),
    ...scheduleSettings,
  };
}

function variationLabelAt(index: number): string {
  const code = "A".charCodeAt(0) + index;
  return String.fromCharCode(code);
}

function buildDefaultVariationsForStep(
  step: SequenceStepDraft,
  stepIndex: number
): SequenceVariation[] {
  return [
    {
      id: `${step.id}-var-a`,
      label: "A",
      name: `Variation Name ${stepIndex + 1}A`,
      subject: step.subject || "",
      body: step.body || "",
    },
    {
      id: `${step.id}-var-b`,
      label: "B",
      name: `Variation Name ${stepIndex + 1}B`,
      subject: "",
      body: "",
    },
  ];
}

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
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [sequenceAgentError, setSequenceAgentError] = useState<string | null>(null);
  const [sequenceAgentInput, setSequenceAgentInput] = useState("");
  const sequenceAgentEndRef = useRef<HTMLDivElement | null>(null);
  const [campaignData, setCampaignData] = useState<PlusVibeCampaign>(campaign);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadTagFilter, setLeadTagFilter] = useState("all");
  const [leadPage, setLeadPage] = useState(1);
  const resolvedCampaign = campaignData || campaign;

  const { data: leadData, mutate: mutateLeads } = useCampaignLeads(resolvedCampaign.id, companyId, {
    page: leadPage,
    limit: LEADS_PAGE_SIZE,
    status: leadStatusFilter !== "all" ? leadStatusFilter : undefined,
    tag: leadTagFilter !== "all" ? leadTagFilter : undefined,
    search: leadSearch.trim() || undefined,
    sort: "updated_at",
    direction: "desc",
  });

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
        `/api/plusvibe/campaigns/${resolvedCampaign.id}/leads?companyId=${companyId}`,
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

  const initialSequenceState = useMemo(() => buildSequenceEditorState(resolvedCampaign), [resolvedCampaign]);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStepDraft[]>(initialSequenceState.steps);
  const [selectedSequenceStepId, setSelectedSequenceStepId] = useState(
    initialSequenceState.steps[0]?.id || ""
  );
  const [stepVariations, setStepVariations] = useState<Record<string, SequenceVariation[]>>(
    initialSequenceState.stepVariations
  );
  const [activeVariationByStep, setActiveVariationByStep] = useState<Record<string, string>>(
    initialSequenceState.activeVariationByStep
  );

  const initialSettings = useMemo(() => extractCampaignSettings(resolvedCampaign), [resolvedCampaign]);
  const [settingsName, setSettingsName] = useState(initialSettings.name);
  const [dailyLimit, setDailyLimit] = useState(initialSettings.dailyLimit);
  const [trackOpens, setTrackOpens] = useState(initialSettings.trackOpens);
  const [trackClicks, setTrackClicks] = useState(initialSettings.trackClicks);
  const [stopOnReply, setStopOnReply] = useState(initialSettings.stopOnReply);
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(initialSettings.unsubscribeFooter);
  const [selectedSenderPool, setSelectedSenderPool] = useState(initialSettings.selectedSenderPool);

  const [timezone, setTimezone] = useState(initialSettings.timezone);
  const [startHour, setStartHour] = useState(initialSettings.startHour);
  const [endHour, setEndHour] = useState(initialSettings.endHour);
  const [sendingDays, setSendingDays] = useState<string[]>(initialSettings.sendingDays);
  const [minDelayMinutes, setMinDelayMinutes] = useState(initialSettings.minDelayMinutes);
  const [scheduleName, setScheduleName] = useState(initialSettings.scheduleName);
  const [selectedScheduleId, setSelectedScheduleId] = useState("schedule-default");

  const [subsequences, setSubsequences] = useState<SubsequenceDraft[]>(INITIAL_SUBSEQUENCES);
  const [isSubsequenceDialogOpen, setIsSubsequenceDialogOpen] = useState(false);
  const [subsequenceStep, setSubsequenceStep] = useState<1 | 2>(1);
  const [subsequenceName, setSubsequenceName] = useState("");
  const [subsequenceConditionType, setSubsequenceConditionType] = useState("reply_not_received");
  const [subsequenceConditionValue, setSubsequenceConditionValue] = useState("3");

  const sendingDaySet = useMemo(() => new Set(sendingDays), [sendingDays]);
  const leads: CampaignLead[] = leadData?.leads || [];
  const totalLeads = leadData?.total || 0;
  const leadLimit = leadData?.limit || LEADS_PAGE_SIZE;
  const leadCurrentPage = leadData?.page || leadPage;
  const leadTotalPages = Math.max(1, Math.ceil(totalLeads / leadLimit));
  const leadSource = leadData?.source || "plusvibe";

  const totalSentFromSteps = sequenceSteps.reduce((sum, step) => sum + step.sent, 0);
  const totalSent = resolvedCampaign.stats?.sent ?? totalSentFromSteps;
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
    setCampaignData(campaign);
  }, [campaign]);

  useEffect(() => {
    if (!companyId) {
      setCampaignData(campaign);
      return;
    }

    let isCancelled = false;
    setCampaignLoading(true);

    fetch(`/api/plusvibe/campaigns/${campaign.id}?companyId=${encodeURIComponent(companyId)}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: "Failed to load campaign" }));
          throw new Error(payload.error || "Failed to load campaign");
        }
        return response.json();
      })
      .then((payload) => {
        if (!isCancelled && payload?.campaign) {
          setCampaignData(payload.campaign);
        }
      })
      .catch((detailErr) => {
        if (!isCancelled) {
          setError(detailErr instanceof Error ? detailErr.message : "Failed to load campaign");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setCampaignLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [campaign, companyId]);

  useEffect(() => {
    sequenceAgentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sequenceAgentMessages]);

  useEffect(() => {
    setLeadPage(1);
  }, [leadStatusFilter, leadTagFilter, leadSearch, resolvedCampaign.id]);

  useEffect(() => {
    setSequenceSteps(initialSequenceState.steps);
    setSelectedSequenceStepId(initialSequenceState.steps[0]?.id || "");
    setStepVariations(initialSequenceState.stepVariations);
    setActiveVariationByStep(initialSequenceState.activeVariationByStep);
  }, [resolvedCampaign.id, initialSequenceState]);

  useEffect(() => {
    const settings = extractCampaignSettings(resolvedCampaign);
    setSettingsName(settings.name);
    setDailyLimit(settings.dailyLimit);
    setTrackOpens(settings.trackOpens);
    setTrackClicks(settings.trackClicks);
    setStopOnReply(settings.stopOnReply);
    setUnsubscribeFooter(settings.unsubscribeFooter);
    setSelectedSenderPool(settings.selectedSenderPool);
    setTimezone(settings.timezone);
    setStartHour(settings.startHour);
    setEndHour(settings.endHour);
    setSendingDays(settings.sendingDays);
    setMinDelayMinutes(settings.minDelayMinutes);
    setScheduleName(settings.scheduleName);
  }, [resolvedCampaign]);

  const variationsForSelectedStep = selectedSequenceStep
    ? stepVariations[selectedSequenceStep.id] || []
    : [];
  const activeVariationId = selectedSequenceStep
    ? activeVariationByStep[selectedSequenceStep.id] || variationsForSelectedStep[0]?.id || ""
    : "";
  const selectedVariation = variationsForSelectedStep.find((variation) => variation.id === activeVariationId) ||
    variationsForSelectedStep[0] ||
    null;

  const savePatch = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/plusvibe/campaigns/${resolvedCampaign.id}${companyQuery}`, {
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
    let nextStepIndex = 0;
    setSequenceSteps((prev) => {
      nextStepIndex = prev.length;
      return [
        ...prev,
        {
          id: stepId,
          title: `Step ${prev.length + 1}`,
          subject: "",
          body: "",
          waitDays: prev.length === 0 ? 0 : 3,
          sent: 0,
          openRate: 0,
          replyRate: 0,
          positiveRate: 0,
        },
      ];
    });
    const blankStep: SequenceStepDraft = {
      id: stepId,
      title: `Step ${nextStepIndex + 1}`,
      subject: "",
      body: "",
      waitDays: nextStepIndex === 0 ? 0 : 3,
      sent: 0,
      openRate: 0,
      replyRate: 0,
      positiveRate: 0,
    };
    const variations = buildDefaultVariationsForStep(blankStep, nextStepIndex);
    setStepVariations((prev) => ({ ...prev, [stepId]: variations }));
    setActiveVariationByStep((prev) => ({ ...prev, [stepId]: variations[0]?.id || "" }));
    setSelectedSequenceStepId(stepId);
  };

  const selectVariationForStep = (stepId: string, variationId: string) => {
    setActiveVariationByStep((prev) => ({ ...prev, [stepId]: variationId }));
  };

  const addVariationToStep = (stepId: string) => {
    setStepVariations((prev) => {
      const existing = prev[stepId] || [];
      const nextIndex = existing.length;
      const stepIndex = sequenceSteps.findIndex((step) => step.id === stepId);
      const nextVariation: SequenceVariation = {
        id: `${stepId}-var-${Date.now()}`,
        label: variationLabelAt(nextIndex),
        name: `Variation Name ${Math.max(0, stepIndex) + 1}${variationLabelAt(nextIndex)}`,
        subject: "",
        body: "",
      };
      const next = [...existing, nextVariation];
      setActiveVariationByStep((activePrev) => ({ ...activePrev, [stepId]: nextVariation.id }));
      return { ...prev, [stepId]: next };
    });
  };

  const removeVariationFromStep = (stepId: string) => {
    setStepVariations((prev) => {
      const existing = prev[stepId] || [];
      if (existing.length <= 1) return prev;
      const currentId = activeVariationByStep[stepId] || existing[0]?.id;
      const filtered = existing.filter((variation) => variation.id !== currentId);
      const relabeled = filtered.map((variation, index) => ({
        ...variation,
        label: variationLabelAt(index),
      }));
      setActiveVariationByStep((activePrev) => ({
        ...activePrev,
        [stepId]: relabeled[0]?.id || "",
      }));
      return { ...prev, [stepId]: relabeled };
    });
  };

  const updateSelectedVariation = (
    patch: Partial<Pick<SequenceVariation, "name" | "subject" | "body">>
  ) => {
    if (!selectedSequenceStep || !selectedVariation) return;
    const stepId = selectedSequenceStep.id;
    setStepVariations((prev) => ({
      ...prev,
      [stepId]: (prev[stepId] || []).map((variation) =>
        variation.id === selectedVariation.id ? { ...variation, ...patch } : variation
      ),
    }));
  };

  const saveSequences = () => {
    void savePatch({
      sequences: sequenceSteps.map((step, index) => ({
        step: index + 1,
        wait_time: step.waitDays,
        variations: (stepVariations[step.id] || []).map((variation, variationIndex) => ({
          variation: variation.label || String.fromCharCode(65 + variationIndex),
          name: variation.name,
          subject: variation.subject,
          body: variation.body,
        })),
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
        campaignId: resolvedCampaign.id,
        campaignName: resolvedCampaign.name,
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
            <h2 className="truncate text-lg font-semibold text-foreground">{resolvedCampaign.name}</h2>
            <p className="text-sm text-muted-foreground">Campaign Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaignLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <Badge variant="outline" className="capitalize">
            {resolvedCampaign.status || "Draft"}
          </Badge>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Leads</p>
            <p className="text-xl font-semibold text-foreground mt-1">{resolvedCampaign.stats?.leadCount || leads.length}</p>
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
            <p className="text-xl font-semibold text-foreground mt-1">{resolvedCampaign.stats?.replyRate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Positive Rate</p>
            <p className="text-xl font-semibold text-foreground mt-1">{resolvedCampaign.stats?.positiveRate || 0}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-6">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="stepAnalytics">Step Analytics</TabsTrigger>
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
                Showing {leads.length} of {totalLeads} leads
              </p>
              {leadSource === "inbox_fallback" ? (
                <p className="text-xs text-amber-600">
                  PlusVibe did not return campaign lead rows for this campaign, so replied leads are shown from Inbox history.
                </p>
              ) : null}
              {leadTotalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Page {leadCurrentPage} of {leadTotalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLeadPage((prev) => Math.max(1, prev - 1))}
                      disabled={leadCurrentPage <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLeadPage((prev) => Math.min(leadTotalPages, prev + 1))
                      }
                      disabled={leadCurrentPage >= leadTotalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stepAnalytics" className="space-y-4 mt-4">
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Step Analytics</p>
                <p className="text-xs text-muted-foreground">
                  Performance snapshot by step and recent activity.
                </p>
              </div>
              <Badge variant="outline">Draft-friendly view</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Open Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {resolvedCampaign.stats?.openRate ?? 0}%
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Click Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">0%</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Reply Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {resolvedCampaign.stats?.replyRate ?? 0}%
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">Positive Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {resolvedCampaign.stats?.positiveRate ?? 0}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-medium text-foreground">Step Breakdown</p>
                <div className="mt-3 space-y-2">
                  {sequenceSteps.map((step, index) => (
                    <div
                      key={`analytics-step-${step.id}`}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">Step {index + 1}</span>
                      <span className="text-muted-foreground">{step.sent} sent</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-medium text-foreground">Activity</p>
                <div className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Step analytics and recent activity will appear here once the campaign is published.
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sequences" className="mt-4">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4" />
                Sequences
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 bg-muted/10 p-3 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
              <aside className="space-y-3 rounded-md border border-border bg-card p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
                <div className="space-y-3">
                  {sequenceSteps.map((step, index) => {
                    const isSelected = step.id === selectedSequenceStep?.id;
                    const variations = stepVariations[step.id] || [];
                    const activeVariationIdForStep =
                      activeVariationByStep[step.id] || variations[0]?.id || "";
                    const activeVariation =
                      variations.find((variation) => variation.id === activeVariationIdForStep) || variations[0];

                    return (
                      <div
                        key={step.id}
                        className={`rounded-xl border p-3 transition-colors ${
                          isSelected ? "border-primary/60 bg-primary/10" : "border-border bg-card"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedSequenceStepId(step.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">Step {index + 1}</p>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              {variations.length} variations
                            </span>
                          </div>
                        </button>

                        <div className="mt-2 flex items-center gap-2">
                          {variations.map((variation) => (
                            <button
                              key={variation.id}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedSequenceStepId(step.id);
                                selectVariationForStep(step.id, variation.id);
                              }}
                              className={`h-8 min-w-8 rounded-md border px-3 text-xs font-medium ${
                                activeVariationIdForStep === variation.id
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground"
                              }`}
                            >
                              {variation.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSequenceStepId(step.id);
                              addVariationToStep(step.id);
                            }}
                            className="h-8 w-8 rounded-full border border-primary text-primary"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSequenceStepId(step.id);
                              removeVariationFromStep(step.id);
                            }}
                            className="h-8 w-8 rounded-full border border-red-400 text-red-400"
                          >
                            -
                          </button>
                        </div>

                        <Input
                          value={activeVariation?.name || ""}
                          onChange={(event) => {
                            setSelectedSequenceStepId(step.id);
                            setActiveVariationByStep((prev) => ({ ...prev, [step.id]: activeVariationIdForStep }));
                            setStepVariations((prev) => ({
                              ...prev,
                              [step.id]: (prev[step.id] || []).map((variation) =>
                                variation.id === activeVariationIdForStep
                                  ? { ...variation, name: event.target.value }
                                  : variation
                              ),
                            }));
                          }}
                          className="mt-3"
                          placeholder={`Variation Name ${index + 1}${activeVariation?.label || "A"}`}
                        />

                        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Wait</span>
                          <Input
                            type="number"
                            min={index === 0 ? 0 : 1}
                            value={step.waitDays}
                            onChange={(event) =>
                              updateSequenceStep(step.id, {
                                waitDays: Number(event.target.value) || (index === 0 ? 0 : 1),
                              })
                            }
                            className="h-10 w-20"
                          />
                          <span>Day, then</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" onClick={addSequenceStep} className="w-full">
                  Add Step
                </Button>
              </aside>

              <div className="space-y-4 rounded-md border border-border bg-card p-4">
                {selectedSequenceStep && selectedVariation ? (
                  <>
                    <div className="rounded-md border border-border bg-background">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                        <p className="text-sm font-medium text-foreground">
                          Step {selectedSequenceIndex + 1} · Variation {selectedVariation.label}
                        </p>
                        <Badge variant="outline" className="text-[11px]">
                          {selectedSequenceStep.sent} sent
                        </Badge>
                      </div>

                      <div className="space-y-3 p-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject</label>
                          <Input
                            value={selectedVariation.subject}
                            onChange={(event) =>
                              updateSelectedVariation({ subject: event.target.value })
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Body</label>
                          <textarea
                            value={selectedVariation.body}
                            onChange={(event) =>
                              updateSelectedVariation({ body: event.target.value })
                            }
                            rows={16}
                            className="min-h-[320px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-y"
                          />
                        </div>
                      </div>
                    </div>

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

              <div className="flex min-h-[560px] flex-col rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Bot className="h-5 w-5 text-primary" />
                    Acme AI
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {isSequenceAgentStreaming ? "Thinking..." : "Ready"}
                  </Badge>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {!companyId ? (
                    <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Select a company to activate the Sequence agent.
                    </div>
                  ) : sequenceAgentMessages.length === 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
                        Create personalized email draft for this lead.
                      </div>
                      <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
                        Thought and draft preview will appear here once you send a prompt.
                      </div>
                    </div>
                  ) : (
                    sequenceAgentMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-2xl px-4 py-3 text-sm ${
                          message.role === "user"
                            ? "bg-muted text-foreground"
                            : "border border-border bg-background text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      </div>
                    ))
                  )}
                  <div ref={sequenceAgentEndRef} />
                </div>

                {sequenceAgentError ? (
                  <p className="border-t border-border px-4 py-2 text-xs text-destructive">{sequenceAgentError}</p>
                ) : null}

                <div className="border-t border-border p-4">
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
                      placeholder="Ask Acme AI to improve this variation..."
                      rows={3}
                      className="min-h-[90px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="h-10 w-10 rounded-xl"
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span className="font-medium text-primary">Now</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">End</span>
                  <span className="font-medium text-primary">No end date</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedScheduleId("schedule-default")}
                className={`w-full rounded-md border px-3 py-3 text-left text-sm transition-colors ${
                  selectedScheduleId === "schedule-default"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                New schedule
              </button>

              <Button variant="outline" className="w-full">
                Add schedule
              </Button>
            </aside>

            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div>
                <label className="text-sm font-medium text-foreground">Schedule Name</label>
                <Input
                  className="mt-2"
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  placeholder="New schedule"
                />
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium text-foreground">Timing</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">From</label>
                    <Input type="time" value={startHour} onChange={(event) => setStartHour(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">To</label>
                    <Input type="time" value={endHour} onChange={(event) => setEndHour(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="America/New_York">Eastern Time (US)</option>
                      <option value="America/Chicago">Central Time (US)</option>
                      <option value="America/Los_Angeles">Pacific Time (US)</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium text-foreground">Days</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((dayLabel) => {
                    const short = dayLabel.slice(0, 3);
                    return (
                      <label key={dayLabel} className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={sendingDaySet.has(short)}
                          onChange={() =>
                            setSendingDays((prev) =>
                              prev.includes(short)
                                ? prev.filter((value) => value !== short)
                                : [...prev, short]
                            )
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        {dayLabel}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-start">
                <Button
                  onClick={() =>
                    savePatch({
                      timezone,
                      daily_limit: Number(dailyLimit) || 0,
                      schedule: {
                        name: scheduleName,
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
                  Save
                </Button>
              </div>
            </div>
          </div>
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
