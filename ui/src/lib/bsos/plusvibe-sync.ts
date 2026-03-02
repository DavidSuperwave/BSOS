/**
 * PlusVibe Data Sync
 * Pulls campaigns, leads, analytics, and accounts from PlusVibe API.
 * Normalizes into campaign_signals and bounce_events.
 * Called by the monitoring cron every 30 minutes (failure checks) and every 2 hours (full sync).
 */

import { getProjectCredentials, getPlusVibeHeaders } from "@/lib/plusvibe-project";
import { getAdminClient } from "./db";
import {
  normalizePlusVibeEvent,
  writeSignals,
  writeBounceEvents,
  classifyBounce,
  computeProxyScore,
} from "./signal-pipeline";
import type { BounceEvent, AccountHealthSnapshot, CampaignSignal } from "./types";

const PV_BASE = "https://api.plusvibe.ai/api/v1";

interface PVCampaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
  stats?: Record<string, any>;
}

interface SyncResult {
  campaigns_synced: number;
  signals_written: number;
  bounces_written: number;
  health_snapshots: number;
  errors: string[];
  duration_ms: number;
}

/**
 * Full PlusVibe sync for a company. Pulls everything.
 */
export async function syncPlusVibe(companyId: string): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = {
    campaigns_synced: 0,
    signals_written: 0,
    bounces_written: 0,
    health_snapshots: 0,
    errors: [],
    duration_ms: 0,
  };

  try {
    const pvHeaders = await getPlusVibeHeaders(companyId);
    if (!pvHeaders) {
      result.errors.push("No PlusVibe credentials for company");
      return result;
    }

    const { headers, workspaceId } = pvHeaders;

    // 1. Pull campaigns
    const campaigns = await fetchCampaigns(headers, workspaceId);
    result.campaigns_synced = campaigns.length;

    // 2. For each active campaign, pull leads and analytics
    const allSignals: CampaignSignal[] = [];
    const allBounces: BounceEvent[] = [];

    for (const campaign of campaigns) {
      try {
        // Pull analytics
        const analytics = await fetchCampaignAnalytics(headers, workspaceId, campaign.id);
        if (analytics) {
          allSignals.push({
            company_id: companyId,
            campaign_id: campaign.id,
            signal_type: "open",
            signal_value: { total_opened: analytics.opened, campaign_name: campaign.name },
            proxy_score: 0, // aggregate, not per-lead
            source_platform: "plusvibe",
            recorded_at: new Date().toISOString(),
          });
        }

        // Pull leads with statuses
        const leads = await fetchCampaignLeads(headers, workspaceId, campaign.id);
        for (const lead of leads) {
          // Normalize into signals
          const signals = normalizePlusVibeEvent(companyId, campaign.id, lead);
          allSignals.push(...signals);

          // Extract bounces with full SMTP data
          if (lead.status === "bounced" || lead.is_bounced) {
            allBounces.push({
              company_id: companyId,
              campaign_id: campaign.id,
              email_account: lead.sender_email || "",
              domain: (lead.email || "").split("@")[1] || "",
              bounce_type: lead.bounce_type || "unknown",
              bounce_code: lead.bounce_code || "",
              bounce_msg: lead.bounce_msg || null,
              classification: classifyBounce(lead.bounce_code || "", lead.bounce_msg || null),
              recorded_at: new Date().toISOString(),
            });
          }
        }
      } catch (err: any) {
        result.errors.push(`Campaign ${campaign.id}: ${err.message}`);
      }
    }

    // 3. Write all signals and bounces
    const signalResult = await writeSignals(allSignals);
    result.signals_written = signalResult.inserted;
    result.errors.push(...signalResult.errors);

    const bounceResult = await writeBounceEvents(allBounces);
    result.bounces_written = bounceResult.inserted;
    result.errors.push(...bounceResult.errors);

    // 4. Capture account health snapshots
    const healthSnapshots = await fetchAccountHealth(headers, workspaceId, companyId);
    if (healthSnapshots.length > 0) {
      const db = getAdminClient();
      const { error } = await db.from("account_health_snapshots").insert(healthSnapshots);
      if (error) result.errors.push(`Health snapshots: ${error.message}`);
      else result.health_snapshots = healthSnapshots.length;
    }
  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// ─── Internal fetch helpers ───

async function fetchCampaigns(
  headers: Record<string, string>,
  workspaceId: string
): Promise<PVCampaign[]> {
  const res = await fetch(
    `${PV_BASE}/campaign/list?workspace_id=${workspaceId}&limit=100`,
    { headers }
  );
  if (!res.ok) throw new Error(`PlusVibe campaigns: HTTP ${res.status}`);
  const data = await res.json();
  return data.data?.campaigns || data.campaigns || [];
}

async function fetchCampaignLeads(
  headers: Record<string, string>,
  workspaceId: string,
  campaignId: string
): Promise<any[]> {
  const res = await fetch(
    `${PV_BASE}/leads?workspace_id=${workspaceId}&campaign_id=${campaignId}&limit=500`,
    { headers }
  );
  if (!res.ok) return []; // Non-fatal
  const data = await res.json();
  return data.data?.leads || data.leads || [];
}

async function fetchCampaignAnalytics(
  headers: Record<string, string>,
  workspaceId: string,
  campaignId: string
): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(
      `${PV_BASE}/campaign/analytics?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || data;
  } catch {
    return null;
  }
}

async function fetchAccountHealth(
  headers: Record<string, string>,
  workspaceId: string,
  companyId: string
): Promise<AccountHealthSnapshot[]> {
  try {
    const res = await fetch(
      `${PV_BASE}/email-accounts?workspace_id=${workspaceId}&limit=100`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const accounts = data.data?.email_accounts || data.email_accounts || [];

    return accounts.map((acc: any): AccountHealthSnapshot => ({
      company_id: companyId,
      domain: (acc.email || "").split("@")[1] || "",
      email_account: acc.email || "",
      health_score: acc.health_score ?? 100,
      inbox_placement_rate: acc.inbox_rate ?? null,
      blacklist_status: acc.blacklist_status || {},
      spf_pass: acc.spf_pass ?? true,
      dkim_pass: acc.dkim_pass ?? true,
      dmarc_pass: acc.dmarc_pass ?? true,
      snapshot_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}
