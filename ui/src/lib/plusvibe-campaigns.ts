import { plusvibeFetch } from "@/lib/plusvibe-client";

const DEFAULT_STATS_START = "2020-01-01";
const DEFAULT_STATS_END = "2030-12-31";

type CampaignQueryOptions = {
  campaignId?: string;
  parentCampId?: string;
  status?: string;
  campaignType?: string;
  skip?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

export interface NormalizedCampaignStats {
  sent: number;
  replies: number;
  positive: number;
  opened: number;
  leadCount: number;
  contacted: number;
  completed: number;
  bounced: number;
  unsubscribed: number;
  replyRate: number;
  positiveRate: number;
  openRate: number;
  contactedRate: number;
}

export interface NormalizedCampaignRecord extends Record<string, any> {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  modifiedAt?: string;
  stats: NormalizedCampaignStats;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeCampaignStatus(input: unknown): string {
  const value = String(input || "").toLowerCase().trim();
  if (["active", "running", "launched", "started", "live", "in_progress", "enabled", "on"].includes(value)) {
    return "active";
  }
  if (["paused", "pause", "stopped", "inactive", "disabled", "off"].includes(value)) {
    return "paused";
  }
  if (["complete", "completed", "finished", "done", "ended"].includes(value)) {
    return "complete";
  }
  if (!value || value === "draft" || value === "new" || value === "pending") {
    return "draft";
  }
  return value;
}

export function extractArray(source: any, keys: string[] = ["value", "data", "items", "results", "campaigns"]) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }

  const nestedData = source.data;
  if (nestedData && typeof nestedData === "object") {
    for (const key of keys) {
      if (Array.isArray(nestedData[key])) return nestedData[key];
    }
  }

  return [];
}

export function extractStatsRecords(source: any): any[] {
  const arrayCandidate = extractArray(source, ["value", "data", "items", "results"]);
  if (arrayCandidate.length > 0) return arrayCandidate;

  if (source && typeof source === "object" && !Array.isArray(source)) {
    const objectValues = Object.values(source).filter(
      (value) => value && typeof value === "object" && !Array.isArray(value)
    );
    if (objectValues.length > 0) return objectValues;
  }

  return [];
}

export function normalizeCampaignStats(raw: any): NormalizedCampaignStats {
  const sent = readNumber(raw?.sent_count ?? raw?.sent ?? raw?.emails_sent ?? raw?.total_sent);
  const replies = readNumber(raw?.replied_count ?? raw?.replies ?? raw?.total_replies);
  const positive = readNumber(raw?.positive_reply_count ?? raw?.positive ?? raw?.positive_replies);
  const opened = readNumber(raw?.unique_opened_count ?? raw?.opened ?? raw?.total_opened);
  const leadCount = readNumber(raw?.lead_count ?? raw?.total_leads);
  const contacted = readNumber(raw?.lead_contacted_count ?? raw?.contacted ?? raw?.leads_contacted);
  const completed = readNumber(raw?.completed_lead_count ?? raw?.completed ?? raw?.leads_completed);
  const bounced = readNumber(raw?.bounced_count ?? raw?.bounced ?? raw?.total_bounced);
  const unsubscribed = readNumber(raw?.unsubscribed_count ?? raw?.unsubscribed);

  return {
    sent,
    replies,
    positive,
    opened,
    leadCount,
    contacted,
    completed,
    bounced,
    unsubscribed,
    replyRate: sent > 0 ? Number(((replies / sent) * 100).toFixed(1)) : 0,
    positiveRate: replies > 0 ? Number(((positive / replies) * 100).toFixed(1)) : 0,
    openRate: sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0,
    contactedRate: leadCount > 0 ? Number(((contacted / leadCount) * 100).toFixed(1)) : 0,
  };
}

export function buildCampaignStatsMap(source: any) {
  return extractStatsRecords(source).reduce<Record<string, any>>((acc, stat) => {
    const key = firstString(stat?._id, stat?.id, stat?.campaign_id);
    if (!key) return acc;
    acc[key] = stat;
    return acc;
  }, {});
}

export function normalizeCampaignRecord(campaign: any, stats?: any): NormalizedCampaignRecord {
  const id = firstString(campaign?._id, campaign?.id, campaign?.campaign_id);
  const createdAt =
    firstString(campaign?.created_at, campaign?.createdAt, campaign?.created_on) ||
    new Date().toISOString();
  const modifiedAt = firstString(campaign?.modified_at, campaign?.modifiedAt);

  return {
    ...campaign,
    id,
    name: firstString(campaign?.camp_name, campaign?.name, campaign?.title) || "Untitled Campaign",
    status: normalizeCampaignStatus(campaign?.status || campaign?.campaign_status || campaign?.state),
    createdAt,
    modifiedAt: modifiedAt || undefined,
    stats: normalizeCampaignStats(stats),
  };
}

function buildCampaignListPath(options?: CampaignQueryOptions) {
  const query = new URLSearchParams();
  if (options?.campaignId) query.set("campaign_id", options.campaignId);
  if (options?.parentCampId) query.set("parent_camp_id", options.parentCampId);
  if (options?.status) query.set("status", options.status);
  if (options?.campaignType) query.set("campaign_type", options.campaignType);
  if (typeof options?.skip === "number") query.set("skip", String(options.skip));
  if (typeof options?.limit === "number") query.set("limit", String(options.limit));

  const serialized = query.toString();
  return serialized ? `/campaign/list-all?${serialized}` : "/campaign/list-all";
}

function buildCampaignStatsPath(options?: CampaignQueryOptions) {
  const query = new URLSearchParams({
    start_date: options?.startDate || DEFAULT_STATS_START,
    end_date: options?.endDate || DEFAULT_STATS_END,
  });
  if (options?.campaignId) query.set("campaign_id", options.campaignId);
  return `/analytics/campaign/stats?${query.toString()}`;
}

export async function fetchCampaignsWithStats(
  companyId?: string,
  options?: CampaignQueryOptions
): Promise<{ campaigns: NormalizedCampaignRecord[]; statsMap: Record<string, any> }> {
  const [listPayload, statsPayload] = await Promise.all([
    plusvibeFetch(buildCampaignListPath(options), companyId, { method: "GET" }),
    plusvibeFetch(buildCampaignStatsPath(options), companyId, { method: "GET" }).catch(() => null),
  ]);

  const campaignsRaw = extractArray(listPayload);
  const statsMap = buildCampaignStatsMap(statsPayload);

  return {
    campaigns: campaignsRaw.map((campaign: any) => {
      const campaignId = firstString(campaign?._id, campaign?.id, campaign?.campaign_id);
      return normalizeCampaignRecord(campaign, statsMap[campaignId]);
    }),
    statsMap,
  };
}

export async function fetchCampaignDetail(companyId: string | undefined, campaignId: string) {
  const { campaigns, statsMap } = await fetchCampaignsWithStats(companyId, { campaignId });
  const campaign = campaigns.find((entry) => entry.id === campaignId) || null;
  return {
    campaign,
    rawStats: statsMap[campaignId] || null,
  };
}

export function summarizeCampaignStats(campaigns: Array<{ stats?: Partial<NormalizedCampaignStats> }>) {
  const totals = campaigns.reduce(
    (acc, campaign) => {
      const stats = campaign.stats || {};
      acc.sent += readNumber(stats.sent);
      acc.replies += readNumber(stats.replies);
      acc.positive += readNumber(stats.positive);
      acc.opened += readNumber(stats.opened);
      acc.leadCount += readNumber(stats.leadCount);
      acc.contacted += readNumber(stats.contacted);
      acc.completed += readNumber(stats.completed);
      acc.bounced += readNumber(stats.bounced);
      acc.unsubscribed += readNumber(stats.unsubscribed);
      return acc;
    },
    {
      sent: 0,
      replies: 0,
      positive: 0,
      opened: 0,
      leadCount: 0,
      contacted: 0,
      completed: 0,
      bounced: 0,
      unsubscribed: 0,
    }
  );

  return {
    ...totals,
    replyRate: totals.sent > 0 ? Number(((totals.replies / totals.sent) * 100).toFixed(1)) : 0,
    positiveRate: totals.replies > 0 ? Number(((totals.positive / totals.replies) * 100).toFixed(1)) : 0,
    openRate: totals.sent > 0 ? Number(((totals.opened / totals.sent) * 100).toFixed(1)) : 0,
  };
}
