export interface EmailStep {
  step: number;
  subject?: string;
  body?: string;
  delay_days?: number;
}

export interface PlusVibeCampaign {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  stats: {
    leads_total: number;
    contacted: number;
    replied: number;
    positive: number;
    reply_rate: number;
    positive_rate: number;
  };
  email_sequence: EmailStep[];
  targeting: { industries?: string[]; titles?: string[] };
}

export interface ImportPlusVibeConfig {
  apiKey: string;
  workspaceId: string;
  importRange: { from: Date; to: Date };
}

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function normalizeStatus(status: string): "active" | "paused" | "completed" {
  const s = String(status || "").toLowerCase();
  if (s.includes("pause")) return "paused";
  if (s.includes("complete") || s.includes("finish")) return "completed";
  return "active";
}

function safeNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function importPlusVibeCampaigns(
  config: ImportPlusVibeConfig
): Promise<PlusVibeCampaign[]> {
  try {
    const listRes = await fetch(
      `${PLUSVIBE_BASE}/campaign/list?workspace_id=${encodeURIComponent(config.workspaceId)}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
      }
    );

    if (!listRes.ok) {
      const details = await listRes.text();
      throw new Error(`PlusVibe campaign list failed (${listRes.status}): ${details.slice(0, 300)}`);
    }

    const listData = await listRes.json();
    const campaigns = (listData?.value || listData?.data || listData || []) as any[];

    const startDate = config.importRange.from.toISOString().slice(0, 10);
    const endDate = config.importRange.to.toISOString().slice(0, 10);
    const statsRes = await fetch(
      `${PLUSVIBE_BASE}/campaign/stats?workspace_id=${encodeURIComponent(
        config.workspaceId
      )}&start_date=${startDate}&end_date=${endDate}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
      }
    );

    let statsMap: Record<string, any> = {};
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      if (Array.isArray(statsData)) {
        statsMap = statsData.reduce((acc: Record<string, any>, row: any) => {
          const id = row?._id || row?.id;
          if (id) acc[id] = row;
          return acc;
        }, {});
      }
    }

    return campaigns.map((row) => {
      const id = String(row?._id || row?.id || "");
      const stats = statsMap[id] || {};

      const sent = safeNumber(stats.sent_count);
      const replied = safeNumber(stats.replied_count);
      const positive = safeNumber(stats.positive_reply_count);
      const leadsTotal = safeNumber(stats.lead_count);
      const contacted = safeNumber(stats.lead_contacted_count);

      const steps: EmailStep[] = Array.isArray(row?.sequence)
        ? row.sequence.map((step: any, index: number) => ({
            step: index + 1,
            subject: step?.subject,
            body: step?.body,
            delay_days: safeNumber(step?.delay_days),
          }))
        : [];

      return {
        id,
        name: String(row?.name || "Untitled Campaign"),
        status: normalizeStatus(String(row?.status || "")),
        stats: {
          leads_total: leadsTotal,
          contacted,
          replied,
          positive,
          reply_rate: safeNumber(stats.reply_rate) || toPct(replied, sent || contacted || leadsTotal),
          positive_rate: safeNumber(stats.positive_rate) || toPct(positive, replied),
        },
        email_sequence: steps,
        targeting: {
          industries: Array.isArray(row?.targeting?.industries) ? row.targeting.industries : undefined,
          titles: Array.isArray(row?.targeting?.titles) ? row.targeting.titles : undefined,
        },
      };
    });
  } catch (error) {
    console.error("[PlusVibe Importer] import error:", error);
    throw error;
  }
}
