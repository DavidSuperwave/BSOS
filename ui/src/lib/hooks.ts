"use client";

import useSWR, { type SWRConfiguration } from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("API request failed");
    (error as any).status = res.status;
    try {
      (error as any).info = await res.json();
    } catch {}
    throw error;
  }
  return res.json();
};

export function useApiData<T = any>(
  url: string | null,
  config?: SWRConfiguration
) {
  return useSWR<T>(url, fetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}

// ---- Typed hooks ----

export interface DashboardMetrics {
  totalReplies: number;
  positiveReplies: number;
  activeLeads: number;
  totalLeads?: number;
  meetingsBooked: number;
  totalCampaigns?: number;
  totalSends?: number;
  plusvibeStats?: {
    totalLeads: number;
    contacted: number;
    finished: number;
    replied: number;
    positive: number;
    bounced: number;
    openRate: number;
  };
  errors?: string[];
  activeCampaigns: {
    id: string;
    name: string;
    status: string;
    lastSent?: string;
    lastReplied?: string;
    createdAt?: string;
  }[];
  campaignPerformance?: {
    name: string;
    sent: number;
    replies: number;
    positive: number;
    rate: number;
  }[];
  range?: string;
  configured: boolean;
}

export function useDashboardMetrics(companyId?: string, range?: string) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (range) params.set("range", range);
  return useApiData<DashboardMetrics>(
    companyId ? `/api/dashboard/metrics?${params.toString()}` : null
  );
}

export interface DashboardActivity {
  id: string;
  company_id: string;
  event_type: "email_reply" | "meeting_booked" | "opportunity_created";
  title: string;
  description?: string;
  actions?: any[];
  priority: "low" | "medium" | "high" | "urgent";
  status: "unread" | "read" | "acted" | "dismissed";
  created_at: string;
}

export function useDashboardActivities(
  companyId?: string,
  range: "today" | "yesterday" | "week" = "today",
  sort: "date_desc" | "date_asc" = "date_desc",
  search?: string
) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams({ companyId, range, sort });
    if (search && search.trim()) params.set("search", search.trim());
    url = `/api/dashboard/activities?${params.toString()}`;
  }
  return useApiData<{ activities: DashboardActivity[] }>(url);
}

export interface PlusVibeCampaign {
  id: string;
  name: string;
  status: string;
  sequences?: Array<Record<string, any>>;
  sequence?: Array<Record<string, any>> | Record<string, any>;
  stats?: {
    sent: number;
    replies: number;
    positive: number;
    opened: number;
    leadCount: number;
    contacted: number;
    replyRate: number;
    positiveRate: number;
    openRate: number;
    contactedRate: number;
    completed?: number;
    bounced?: number;
    unsubscribed?: number;
  };
  createdAt: string;
}

export function useCampaigns(companyId?: string) {
  return useApiData<{ campaigns: PlusVibeCampaign[] }>(
    companyId ? `/api/plusvibe/campaigns?companyId=${companyId}` : null
  );
}

export interface CampaignLead {
  id: string;
  name: string;
  email: string;
  company: string;
  title?: string;
  status: string;
  tag: string;
  step: string;
  lastActivity: string;
}

interface CampaignLeadsQuery {
  page?: number;
  limit?: number;
  status?: string;
  tag?: string;
  search?: string;
  step?: string;
  sort?: string;
  direction?: string;
}

export function useCampaignLeads(
  campaignId?: string,
  companyId?: string,
  options?: CampaignLeadsQuery
) {
  let url: string | null = null;
  if (campaignId && companyId) {
    const params = new URLSearchParams();
    params.set("companyId", companyId);
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.status) params.set("status", options.status);
    if (options?.tag) params.set("tag", options.tag);
    if (options?.search) params.set("search", options.search);
    if (options?.step) params.set("step", options.step);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    url = `/api/plusvibe/campaigns/${campaignId}/leads?${params.toString()}`;
  }
  return useApiData<{ leads: CampaignLead[]; total: number; page: number; limit: number; source?: string }>(url);
}

export interface CampaignAnalyticsData {
  dailyStats: { date: string; newLead: number; followUp: number }[];
  dailyMetrics: { date: string; reply: number; replyWithOOO: number; positive: number; bounce: number }[];
  stepStats: { id: string; title: string; sent: number; replied: number; positive: number }[];
  totals: {
    sent: number;
    contacted: number;
    completed: number;
    replyRate: number;
    positiveRate: number;
    bounceRate: number;
    openRate: number;
    unsubscribeRate: number;
  };
}

export function useCampaignAnalytics(campaignId?: string, companyId?: string) {
  return useApiData<CampaignAnalyticsData>(
    campaignId && companyId
      ? `/api/plusvibe/campaigns/${campaignId}/analytics?companyId=${companyId}`
      : null
  );
}

export function useCampaignScore(campaignId?: string, companyId?: string) {
  return useApiData<{ score: number; breakdown: Record<string, number>; grade: string }>(
    campaignId && companyId
      ? `/api/campaigns/${campaignId}/score?companyId=${companyId}`
      : null
  );
}

export interface ReportDefinition {
  id: string;
  company_id: string;
  title: string;
  description?: string;
  chart_type:
    | "bar"
    | "line"
    | "area"
    | "pie"
    | "donut"
    | "funnel"
    | "scatter"
    | "radar";
  data_source: "campaigns" | "inbox" | "pipeline" | "events" | "custom";
  query_config?: Record<string, any>;
  chart_config?: Record<string, any>;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function useReports(companyId?: string, pinnedOnly = false) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams({ companyId });
    if (pinnedOnly) params.set("pinned", "true");
    url = `/api/reports?${params.toString()}`;
  }
  return useApiData<{ reports: ReportDefinition[] }>(url);
}

export function useReport(companyId?: string, reportId?: string) {
  const url = companyId && reportId
    ? `/api/reports/${reportId}?companyId=${encodeURIComponent(companyId)}`
    : null;
  return useApiData<{ report: ReportDefinition }>(url);
}

export function useReportData(
  companyId?: string,
  reportId?: string,
  options?: { range?: "24h" | "7d" | "30d" | "90d" }
) {
  let url: string | null = null;
  if (companyId && reportId) {
    const params = new URLSearchParams({ companyId });
    if (options?.range) params.set("range", options.range);
    url = `/api/reports/${reportId}/data?${params.toString()}`;
  }
  return useApiData<{ report: ReportDefinition; data: any[]; meta: any }>(url);
}

export interface SupermemoryDocument {
  id: string;
  content: string;
  raw?: string | null;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  containerTag: string;
  containerTags?: string[];
  customId?: string | null;
  url?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, any>;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export function useSupermemoryDocuments(companyId?: string, container?: string) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams();
    params.set("companyId", companyId);
    if (container) params.set("container", container);
    url = `/api/supermemory/documents?${params.toString()}`;
  }
  return useApiData<{ documents: SupermemoryDocument[]; containerTag: string; count: number }>(url);
}

export interface StructuredDocument {
  id: string;
  company_id: string;
  title: string;
  content: any;
  embedded_reports: string[];
  category: "playbook" | "report" | "template" | "note";
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
}

export function useDocuments(
  companyId?: string,
  options?: { category?: string; status?: string }
) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams({ companyId });
    if (options?.category) params.set("category", options.category);
    if (options?.status) params.set("status", options.status);
    url = `/api/documents?${params.toString()}`;
  }
  return useApiData<{ documents: StructuredDocument[] }>(url);
}

export function useDocument(companyId?: string, documentId?: string) {
  const url = companyId && documentId
    ? `/api/documents/${documentId}?companyId=${encodeURIComponent(companyId)}`
    : null;
  return useApiData<{ document: StructuredDocument }>(url);
}

export interface ApiStatus {
  plusvibe: boolean;
  close: boolean;
  calendly: boolean;
  supermemory: boolean;
  perplexity: boolean;
  openclaw: boolean;
}

export function useApiStatus(companyId?: string) {
  return useApiData<ApiStatus>(
    companyId ? `/api/settings/status?companyId=${companyId}` : null
  );
}

// ---- Inbox Management Hooks ----

export interface InboxMessage {
  id: string;
  company_id: string;
  campaign_id: string;
  campaign_name: string;
  thread_id: string;
  plusvibe_id?: string;
  from_email: string;
  from_name: string;
  from_domain: string;
  to_email: string;
  subject: string;
  body: string;
  body_text: string;
  sentiment: "positive" | "neutral" | "negative" | "ooo" | "auto_reply";
  intent?: "interested" | "not_interested" | "meeting_request" | "question" | "referral";
  tags: string[];
  status: "unread" | "read" | "replied" | "archived" | "booked";
  priority: "high" | "medium" | "low";
  reply_count: number;
  last_reply_at: string;
  ai_summary?: string;
  suggested_actions?: any;
  company_enrichment?: any;
  created_at: string;
  updated_at: string;
}

export interface InboxFilters {
  companyId?: string;
  campaignId?: string;
  sentiment?: string;
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
}

export function useInboxMessages(filters?: InboxFilters) {
  let url: string | null = null;
  if (filters?.companyId) {
    const params = new URLSearchParams();
    params.set("companyId", filters.companyId);
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.sentiment) params.set("sentiment", filters.sentiment);
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.search) params.set("search", filters.search);
    if (filters.page) params.set("page", String(filters.page));
    url = `/api/inbox/messages?${params.toString()}`;
  }
  return useApiData<{
    messages: InboxMessage[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(url);
}

export interface EmailTag {
  id: string;
  company_id: string;
  name: string;
  color: string;
  category: "status" | "priority" | "team" | "custom";
  rules?: any;
  created_at: string;
}

export function useEmailTags(companyId?: string) {
  return useApiData<{ tags: EmailTag[] }>(
    companyId ? `/api/inbox/tags?companyId=${companyId}` : null
  );
}

// ---- Inboxing Integration Hooks ----

export interface InboxingDomain {
  id: string;
  company_id: string;
  domain: string;
  status: string;
  inboxing_id?: string;
  mailbox_count: number;
  user_count?: number;
  tags: string[];
  nameservers?: string[];
  redirect_url?: string | null;
  redirect_type?: "NONE" | "REGULAR" | "MASKED";
  health_score: number;
  dns_spf: boolean;
  dns_dkim: boolean;
  dns_dmarc: boolean;
  campaign_id?: string;
  created_at: string;
}

export function useInboxingDomains(companyId?: string, status?: string) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams();
    params.set("companyId", companyId);
    if (status) params.set("status", status);
    url = `/api/inboxing/domains?${params.toString()}`;
  }
  return useApiData<{
    domains: InboxingDomain[];
    pagination: any;
  }>(url);
}

export function useInboxingDomainsQuery(
  companyId?: string,
  options?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams();
    params.set("companyId", companyId);
    if (options?.status) params.set("status", options.status);
    if (options?.search) params.set("search", options.search);
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    url = `/api/inboxing/domains?${params.toString()}`;
  }
  return useApiData<{ domains: InboxingDomain[]; pagination: any }>(url);
}

export function useInboxingHealth(companyId?: string) {
  return useApiData<{
    domains: InboxingDomain[];
    summary: {
      total: number;
      healthy: number;
      at_risk: number;
      burned: number;
      active: number;
      avg_health: number;
    };
  }>(companyId ? `/api/inboxing/health?companyId=${companyId}` : null);
}

export interface MediaFile {
  id: string;
  company_id: string;
  file_name: string;
  file_type: "image" | "video" | "audio" | "pdf" | "document";
  mime_type?: string;
  file_size?: number;
  storage_path?: string;
  thumbnail_path?: string;
  metadata?: Record<string, any>;
  context?: string;
  context_id?: string;
  created_at: string;
  updated_at: string;
}

export function useMediaFiles(
  companyId?: string,
  options?: { context?: string; contextId?: string; fileType?: string }
) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams({ companyId });
    if (options?.context) params.set("context", options.context);
    if (options?.contextId) params.set("contextId", options.contextId);
    if (options?.fileType) params.set("fileType", options.fileType);
    url = `/api/media?${params.toString()}`;
  }
  return useApiData<{ media: MediaFile[] }>(url);
}

export function useMediaFile(companyId?: string, mediaId?: string) {
  const url = companyId && mediaId
    ? `/api/media/${mediaId}?companyId=${encodeURIComponent(companyId)}`
    : null;
  return useApiData<{ media: MediaFile }>(url);
}

export function useRegistrars(companyId?: string) {
  return useApiData<{ registrars: any[] }>(
    companyId ? `/api/inboxing/registrars?companyId=${companyId}` : null
  );
}

export function usePlatformConnections(companyId?: string) {
  return useApiData<{ platforms: any[] }>(
    companyId ? `/api/inboxing/platforms?companyId=${companyId}` : null
  );
}

export interface InboxingUploadJob {
  id: string;
  domain_id: string | null;
  domain: string | null;
  status: "pending" | "processing" | "complete" | "failed";
  retries: number;
  stage: string;
  platform_name: string | null;
  platform_connection_id: string | null;
  error?: string | null;
  created_at: string;
}

export function useInboxingUploadJobs(
  companyId?: string,
  options?: {
    status?: string;
    email?: string;
    domain?: string;
    platform_connection_id?: string;
  }
) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams();
    params.set("companyId", companyId);
    if (options?.status) params.set("status", options.status);
    if (options?.email) params.set("email", options.email);
    if (options?.domain) params.set("domain", options.domain);
    if (options?.platform_connection_id) {
      params.set("platform_connection_id", options.platform_connection_id);
    }
    url = `/api/inboxing/upload/status?${params.toString()}`;
  }
  return useApiData<{
    jobs: InboxingUploadJob[];
    summary: { total: number; completed: number; failed: number };
  }>(url);
}

// ---- Chat Hooks ----

export interface ChatSession {
  id: string;
  title: string;
  session_type: string;
  status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: any;
  reasoning_content?: string;
  reasoning_duration?: number;
  tool_steps?: any;
  content_parts?: any;
  tokens_used?: number;
  model?: string;
  is_compacted: boolean;
  compacted_into?: string;
  created_at: string;
}

export function useChatSessions(companyId?: string, sessionType = "main") {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams({ sessionType });
    params.set("companyId", companyId);
    url = `/api/chat/sessions?${params.toString()}`;
  }
  return useApiData<{ sessions: ChatSession[] }>(url);
}

export function useEventsData(companyId?: string, status?: string) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (status) params.set("status", status);
  return useApiData<{
    events: any[];
    unreadCount: number;
    total: number;
  }>(companyId ? `/api/events?${params.toString()}` : null);
}

// ---- Pipeline Entry Hooks ----

export interface PipelineEntry {
  id: string;
  company_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  contact_name?: string;
  contact_email?: string;
  contact_company?: string;
  source?: "plusvibe" | "manual" | "webhook" | "import" | "ai";
  source_id?: string;
  value?: number;
  priority: "low" | "medium" | "high" | "critical";
  assigned_to?: string;
  custom_fields?: Record<string, any>;
  media?: any[];
  position: number;
  moved_at?: string;
  created_at: string;
  updated_at: string;
}

export function usePipelineEntries(
  companyId?: string,
  options?: {
    pipelineId?: string;
    stageId?: string;
    search?: string;
  }
) {
  let url: string | null = null;
  if (companyId) {
    const params = new URLSearchParams({ companyId });
    if (options?.pipelineId) params.set("pipelineId", options.pipelineId);
    if (options?.stageId) params.set("stageId", options.stageId);
    if (options?.search) params.set("search", options.search);
    url = `/api/pipelines/entries?${params.toString()}`;
  }
  return useApiData<{ entries: PipelineEntry[] }>(url);
}

export function usePipelineEntry(companyId?: string, entryId?: string) {
  const url = companyId && entryId
    ? `/api/pipelines/entries/${entryId}?companyId=${encodeURIComponent(companyId)}`
    : null;
  return useApiData<{ entry: PipelineEntry }>(url);
}

export async function updatePipelineEntry(
  entryId: string,
  payload: Record<string, any> & { companyId: string }
) {
  const res = await fetch(`/api/pipelines/entries/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as any).error || "Failed to update pipeline entry");
  }
  return body as { entry: PipelineEntry };
}

export function useChatMessages(sessionId?: string) {
  return useApiData<{
    messages: ChatMessageRow[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(sessionId ? `/api/chat/messages?sessionId=${sessionId}` : null);
}

// ---- Skills Store Hooks ----

export interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

export interface SkillMissing {
  bins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface SkillAssignmentStatus {
  agentType: "main" | "campaigns" | "crm" | "inbox";
  enabled: boolean;
  eligible: boolean;
  missing: SkillMissing;
  synced: boolean;
  envConfigured: {
    hasApiKey: boolean;
    keys: string[];
  };
  install: {
    status: "pending" | "installed" | "error" | "disabled";
    message?: string | null;
    stdout?: string | null;
    stderr?: string | null;
    code?: number | null;
    warnings?: string[];
    installerId?: string | null;
    installedAt?: string | null;
    lastError?: string | null;
  };
}

export interface SkillStatusEntry {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  skillMd?: string;
  emoji?: string;
  homepage?: string;
  source: "company-local";
  install: SkillInstallOption[];
  requirements: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  assignments: SkillAssignmentStatus[];
  disabled: boolean;
  ready: boolean;
  needsSetup: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillsStatusResponse {
  companyId: string;
  container: {
    name: string | null;
    status: string | null;
  };
  agents: Array<{ agentType: string; agentId: string; status: string }>;
  skills: SkillStatusEntry[];
}

export function useSkillsStatus(companyId?: string) {
  return useApiData<SkillsStatusResponse>(
    companyId ? `/api/companies/${companyId}/agent/skills` : null
  );
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as any).error || "Request failed");
  }
  return body as T;
}

export async function upsertCompanySkill(
  companyId: string,
  payload: {
    slug?: string;
    name?: string;
    description?: string;
    version?: string;
    skillMd: string;
    metadata?: Record<string, any>;
  }
) {
  return jsonRequest<{ success: boolean; skill: any }>(
    `/api/companies/${companyId}/agent/skills`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteCompanySkill(companyId: string, slug: string) {
  return jsonRequest<{ success: boolean }>(
    `/api/companies/${companyId}/agent/skills?slug=${encodeURIComponent(slug)}`,
    {
      method: "DELETE",
    }
  );
}

export async function installCompanySkill(
  companyId: string,
  payload: {
    slug: string;
    agentTypes: string[];
    installId?: string;
  }
) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/install`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function updateCompanySkillSettings(
  companyId: string,
  payload: {
    slug: string;
    agentType?: string;
    agentTypes?: string[];
    enabled?: boolean;
    apiKey?: string;
    env?: Record<string, string>;
  }
) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/update`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function uninstallCompanySkill(
  companyId: string,
  payload: {
    slug: string;
    agentTypes?: string[];
  }
) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/uninstall`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export interface SkillCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  metadata: Record<string, any>;
  isDefault: boolean;
  installed: boolean;
  source: "default" | "company";
}

export function useSkillsCatalog(companyId?: string) {
  return useApiData<{ success: boolean; companyId: string; catalog: SkillCatalogEntry[] }>(
    companyId ? `/api/companies/${companyId}/agent/skills/catalog` : null
  );
}

export async function learnCompanySkill(
  companyId: string,
  payload: {
    action?: "run" | "status" | "cancel";
    sessionId?: string;
    sourceType?: "research" | "url" | "paste_docs";
    mode?: "quick" | "interactive";
    query?: string;
    url?: string;
    content?: string;
    slug?: string;
    name?: string;
    description?: string;
    metadata?: Record<string, any>;
    version?: string;
    save?: boolean;
  }
) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/learn`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function importCompanySkill(
  companyId: string,
  payload: {
    type: "share_link" | "blueprint" | "company_copy";
    token?: string;
    blueprintId?: string;
    sourceCompanyId?: string;
    sourceSkillSlug?: string;
    slug?: string;
    name?: string;
    description?: string;
    replaceExisting?: boolean;
    agentTypes?: Array<"main" | "campaigns" | "crm" | "inbox">;
  }
) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/import`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function createCompanySkillShareLink(
  companyId: string,
  payload: {
    slug: string;
    label?: string;
    expiresInHours?: number;
    maxImports?: number;
    allowDownload?: boolean;
    allowImport?: boolean;
    metadata?: Record<string, any>;
  }
) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/share`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function useCompanySkillShareLinks(companyId?: string, slug?: string) {
  let url: string | null = null;
  if (companyId) {
    const qs = slug ? `?slug=${encodeURIComponent(slug)}` : "";
    url = `/api/companies/${companyId}/agent/skills/share${qs}`;
  }
  return useApiData<{ success: boolean; links: any[] }>(url);
}

export async function revokeCompanySkillShareLink(companyId: string, id: string) {
  return jsonRequest<any>(
    `/api/companies/${companyId}/agent/skills/share?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
