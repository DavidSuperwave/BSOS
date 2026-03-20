/**
 * Agent Tools Library
 *
 * Tools that Julian can call from the chat interface.
 * Each tool has a name, description, and execute function.
 * All tools accept companyId to scope data access.
 */

import { createClient } from "@supabase/supabase-js";
import { plusvibeFetch } from "@/lib/plusvibe-client";
import {
  fetchCampaignDetail,
  fetchCampaignsWithStats,
  summarizeCampaignStats,
} from "@/lib/plusvibe-campaigns";
import { setOptimizationMode } from "@/lib/bsos/phase-manager";

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabaseClient;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  execute: (params: Record<string, any>) => Promise<any>;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

interface AgentDomainRecord {
  id: string;
  record_id: string | null;
  domain: string;
  status: string;
  mailbox_count: number;
  user_count?: number;
  health_score: number;
  dns_spf: boolean;
  dns_dkim: boolean;
  dns_dmarc: boolean;
  created_at: string;
  assigned_at?: string | null;
  tags: string[];
  access_mode: "local" | "assignment";
  nameservers?: string[];
  redirect_url?: string | null;
  redirect_type?: string | null;
}

async function getCompanyDomainRecords(companyId: string): Promise<AgentDomainRecord[]> {
  const supabase = getSupabase();
  const [{ data: localDomains, error: localError }, { data: assignments, error: assignmentError }] =
    await Promise.all([
      supabase
        .from("inboxing_domains")
        .select(
          "id, domain, status, inboxing_id, mailbox_count, user_count, health_score, dns_spf, dns_dkim, dns_dmarc, created_at, tags, nameservers, redirect_url, redirect_type"
        )
        .eq("company_id", companyId),
      supabase
        .from("inboxing_domain_assignments")
        .select(
          "inboxing_id, domain_name, assigned_at, inboxing_domains(id, domain, status, inboxing_id, mailbox_count, user_count, health_score, dns_spf, dns_dkim, dns_dmarc, created_at, tags, nameservers, redirect_url, redirect_type)"
        )
        .eq("company_id", companyId)
        .eq("status", "active"),
    ]);

  if (localError) throw new Error(localError.message);
  if (assignmentError) throw new Error(assignmentError.message);

  const domains = new Map<string, AgentDomainRecord>();

  for (const domain of localDomains || []) {
    domains.set(domain.inboxing_id || domain.id, {
      id: domain.inboxing_id || domain.id,
      record_id: domain.id,
      domain: domain.domain,
      status: domain.status,
      mailbox_count: domain.mailbox_count ?? 0,
      user_count: domain.user_count ?? undefined,
      health_score: domain.health_score ?? 0,
      dns_spf: domain.dns_spf ?? false,
      dns_dkim: domain.dns_dkim ?? false,
      dns_dmarc: domain.dns_dmarc ?? false,
      created_at: domain.created_at,
      assigned_at: null,
      tags: domain.tags || [],
      access_mode: "local",
      nameservers: domain.nameservers || [],
      redirect_url: domain.redirect_url || null,
      redirect_type: domain.redirect_type || "NONE",
    });
  }

  for (const assignment of assignments || []) {
    const localDomain = Array.isArray((assignment as any).inboxing_domains)
      ? (assignment as any).inboxing_domains[0]
      : (assignment as any).inboxing_domains;
    const key = (assignment as any).inboxing_id;

    if (domains.has(key)) {
      const existing = domains.get(key)!;
      domains.set(key, {
        ...existing,
        assigned_at: (assignment as any).assigned_at || existing.assigned_at || null,
      });
      continue;
    }

    domains.set(key, {
      id: key,
      record_id: localDomain?.id || null,
      domain: (assignment as any).domain_name || localDomain?.domain || key,
      status: localDomain?.status || "assigned",
      mailbox_count: localDomain?.mailbox_count ?? 0,
      user_count: localDomain?.user_count ?? undefined,
      health_score: localDomain?.health_score ?? 0,
      dns_spf: localDomain?.dns_spf ?? false,
      dns_dkim: localDomain?.dns_dkim ?? false,
      dns_dmarc: localDomain?.dns_dmarc ?? false,
      created_at: localDomain?.created_at || (assignment as any).assigned_at,
      assigned_at: (assignment as any).assigned_at || null,
      tags: localDomain?.tags || [],
      access_mode: "assignment",
      nameservers: localDomain?.nameservers || [],
      redirect_url: localDomain?.redirect_url || null,
      redirect_type: localDomain?.redirect_type || "NONE",
    });
  }

  return Array.from(domains.values()).sort((a, b) => {
    const aDate = new Date(a.assigned_at || a.created_at).getTime();
    const bDate = new Date(b.assigned_at || b.created_at).getTime();
    return bDate - aDate;
  });
}

export const tools: Tool[] = [
  // ============================================
  // PLUSVIBE TOOLS
  // ============================================
  {
    name: "list_campaigns",
    description: "Get all campaigns from PlusVibe",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
      },
      status: {
        type: "string",
        description:
          "Filter by status: ACTIVE, DRAFT, COMPLETED, ARCHIVED",
      },
      limit: { type: "number", description: "Maximum campaigns to return" },
    },
    execute: async (params) => {
      let campaigns = (await fetchCampaignsWithStats(params.companyId)).campaigns;

      if (params.status) {
        campaigns = campaigns.filter(
          (c: any) => c.status.toLowerCase() === String(params.status).toLowerCase()
        );
      }

      if (params.limit) {
        campaigns = campaigns.slice(0, params.limit);
      }

      return {
        count: campaigns.length,
        campaigns: campaigns.map((c: any) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          createdAt: c.createdAt,
          lastSent: c.last_lead_sent || c.lastSent,
          lastReplied: c.last_lead_replied || c.lastReplied,
          stats: c.stats,
        })),
      };
    },
  },

  {
    name: "get_campaign_details",
    description: "Get details for a specific campaign",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
      },
      campaignId: {
        type: "string",
        description: "Campaign ID",
        required: true,
      },
    },
    execute: async (params) => {
      const { campaign } = await fetchCampaignDetail(params.companyId, params.campaignId);
      if (!campaign) throw new Error("Campaign not found");
      return campaign;
    },
  },
  {
    name: "create_campaign",
    description: "Create a new campaign in PlusVibe",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      campaignName: {
        type: "string",
        description: "Campaign name",
        required: true,
      },
      mode: {
        type: "string",
        description: "Campaign mode: learning or traditional",
      },
      sourceCampaignId: {
        type: "string",
        description: "Optional source campaign ID to duplicate from",
      },
    },
    execute: async (params) => {
      const campaignName = firstString(params.campaignName, params.name, params.camp_name);
      if (!campaignName) throw new Error("campaignName is required");

      const created = await plusvibeFetch("/campaign/add/campaign", params.companyId, {
        method: "POST",
        body: { camp_name: campaignName },
      });
      const campaignId = firstString(created?._id, created?.id, created?.campaign_id);
      if (!campaignId) throw new Error("Campaign created but no campaign ID returned");

      if (params.sourceCampaignId) {
        const { campaign: sourceCampaign } = await fetchCampaignDetail(params.companyId, params.sourceCampaignId);
        if (sourceCampaign) {
          const clonePayload: Record<string, any> = {
            campaign_id: campaignId,
            camp_name: campaignName,
          };

          for (const key of [
            "schedules",
            "sequences",
            "first_wait_time",
            "first_wait_time_unit",
            "email_accounts",
            "send_priority",
            "ignore_mailbox_limit",
            "template_id",
            "stop_on_lead_replied",
            "is_emailopened_tracking",
            "is_unsubscribed_link",
            "send_as_txt",
            "exclude_ooo",
            "ooo_nr_opt",
            "ooo_nr_ai_d",
            "ooo_nr_d",
            "is_acc_based_sending",
            "is_pause_on_bouncerate",
            "bounce_rate_limit",
            "send_risky_email",
            "unsub_blocklist",
            "other_email_acc",
            "is_esp_match",
          ]) {
            if (sourceCampaign[key] !== undefined) clonePayload[key] = sourceCampaign[key];
          }

          if (!clonePayload.schedules && sourceCampaign.schedule) {
            clonePayload.schedules = sourceCampaign.schedule;
          }

          if (Object.keys(clonePayload).length > 2) {
            await plusvibeFetch("/campaign/update/campaign", params.companyId, {
              method: "PATCH",
              body: clonePayload,
            });
          }
        }
      }

      if (params.mode) {
        const mode = String(params.mode).toLowerCase() === "learning" ? "suggest" : "manual";
        await setOptimizationMode(params.companyId, campaignId, mode);
      }

      const { campaign } = await fetchCampaignDetail(params.companyId, campaignId);
      return campaign || { id: campaignId, name: campaignName, status: "draft" };
    },
  },
  {
    name: "update_campaign",
    description: "Update an existing PlusVibe campaign",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      campaignId: {
        type: "string",
        description: "Campaign ID",
        required: true,
      },
      updates: {
        type: "object",
        description: "Update payload for PlusVibe campaign/update/campaign",
        required: true,
      },
    },
    execute: async (params) => {
      if (!params?.updates || typeof params.updates !== "object") {
        throw new Error("updates object is required");
      }

      const payload = {
        ...params.updates,
        campaign_id: params.campaignId,
        ...(params.updates?.campaignName ? { camp_name: params.updates.campaignName } : {}),
      };

      await plusvibeFetch("/campaign/update/campaign", params.companyId, {
        method: "PATCH",
        body: payload,
      });

      const { campaign } = await fetchCampaignDetail(params.companyId, params.campaignId);
      return campaign;
    },
  },
  {
    name: "get_campaign_stats",
    description: "Get stats for one campaign or all campaigns",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      campaignId: {
        type: "string",
        description: "Optional campaign ID",
      },
    },
    execute: async (params) => {
      if (params.campaignId) {
        const { campaign } = await fetchCampaignDetail(params.companyId, params.campaignId);
        if (!campaign) throw new Error("Campaign not found");
        return { campaignId: params.campaignId, stats: campaign.stats };
      }

      const { campaigns } = await fetchCampaignsWithStats(params.companyId);
      return {
        count: campaigns.length,
        totals: summarizeCampaignStats(campaigns),
      };
    },
  },

  // ============================================
  // DOMAIN TOOLS
  // ============================================
  {
    name: "list_domains",
    description: "List domains available to the company",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      status: {
        type: "string",
        description: "Optional status filter",
      },
      limit: { type: "number", description: "Maximum domains to return" },
    },
    execute: async (params) => {
      if (!params.companyId) {
        throw new Error("companyId is required");
      }
      let list = await getCompanyDomainRecords(params.companyId);

      if (params.status) {
        list = list.filter((domain) => domain.status === params.status);
      }

      if (params.limit) {
        list = list.slice(0, params.limit);
      }

      return { count: list.length, domains: list };
    },
  },
  {
    name: "get_domain_details",
    description: "Get one domain with mailbox, DNS, and health details",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      domainId: {
        type: "string",
        description: "Domain identifier returned by list_domains",
      },
      domainName: {
        type: "string",
        description: "Domain name, e.g. example.com",
      },
    },
    execute: async (params) => {
      if (!params.companyId) throw new Error("companyId is required");
      if (!params.domainId && !params.domainName) {
        throw new Error("domainId or domainName is required");
      }

      const domains = await getCompanyDomainRecords(params.companyId);
      const match = domains.find((domain) =>
        params.domainId
          ? domain.id === params.domainId
          : domain.domain.toLowerCase() === String(params.domainName).toLowerCase()
      );

      if (!match) throw new Error("Domain not found");
      return match;
    },
  },
  {
    name: "get_domain_slots",
    description: "Check slot allocation for the company",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
    },
    execute: async (params) => {
      if (!params.companyId) throw new Error("companyId is required");
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("inboxing_slot_allocations")
        .select("total_slots, used_slots, free_slots, allocation_type, expires_at")
        .eq("company_id", params.companyId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        return { total: 0, used: 0, available: 0, type: "free", expires_at: null };
      }

      return {
        total: data.total_slots,
        used: data.used_slots,
        available: data.free_slots ?? Math.max(0, data.total_slots - data.used_slots),
        type: data.allocation_type,
        expires_at: data.expires_at || null,
      };
    },
  },
  {
    name: "get_domain_health",
    description: "Get health summary for all company domains",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      domainId: {
        type: "string",
        description: "Optional single-domain filter",
      },
    },
    execute: async (params) => {
      if (!params.companyId) throw new Error("companyId is required");
      let domains = await getCompanyDomainRecords(params.companyId);
      if (params.domainId) {
        domains = domains.filter((domain) => domain.id === params.domainId);
      }

      const activeDomains = domains.filter((domain) => domain.status === "active");
      const avgHealth = activeDomains.length
        ? Math.round(
            activeDomains.reduce((sum, domain) => sum + (domain.health_score || 0), 0) /
              activeDomains.length
          )
        : 0;

      return {
        total: domains.length,
        active: activeDomains.length,
        healthy: activeDomains.filter((domain) => (domain.health_score || 0) >= 80).length,
        at_risk: activeDomains.filter(
          (domain) => (domain.health_score || 0) >= 40 && (domain.health_score || 0) < 80
        ).length,
        burned: activeDomains.filter((domain) => (domain.health_score || 0) < 40).length,
        avg_health: avgHealth,
        domains,
      };
    },
  },

  // ============================================
  // KNOWLEDGE BASE TOOLS
  // ============================================
  {
    name: "list_knowledge_docs",
    description: "List all knowledge base documents",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      category: { type: "string", description: "Filter by category" },
      limit: { type: "number", description: "Maximum documents to return" },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      let query = supabase
        .from("knowledge_documents")
        .select("id, title, category, created_at")
        .order("created_at", { ascending: false });

      if (params.companyId) {
        query = query.eq("company_id", params.companyId);
      }

      if (params.category) {
        query = query.eq("category", params.category);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return { count: data?.length || 0, documents: data };
    },
  },

  {
    name: "get_knowledge_doc",
    description: "Get a specific knowledge document by ID",
    parameters: {
      id: { type: "string", description: "Document ID", required: true },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("id", params.id)
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  },

  {
    name: "create_knowledge_doc",
    description: "Create a new knowledge base document",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID",
        required: true,
      },
      title: {
        type: "string",
        description: "Document title",
        required: true,
      },
      content: {
        type: "string",
        description: "Document content (markdown)",
        required: true,
      },
      category: {
        type: "string",
        description:
          "Category: company_profile, icp, templates, research, analytics, sales, general",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("knowledge_documents")
        .insert({
          company_id: params.companyId,
          title: params.title,
          content: params.content,
          category: params.category || "general",
          metadata: {
            source: "julian-agent",
            createdAt: new Date().toISOString(),
          },
        } as any)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  },

  {
    name: "update_knowledge_doc",
    description: "Update an existing knowledge document",
    parameters: {
      id: { type: "string", description: "Document ID", required: true },
      title: { type: "string", description: "New title" },
      content: { type: "string", description: "New content" },
      category: { type: "string", description: "New category" },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const updates: any = {};
      if (params.title) updates.title = params.title;
      if (params.content) updates.content = params.content;
      if (params.category) updates.category = params.category;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await (
        supabase.from("knowledge_documents") as any
      )
        .update(updates)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  },

  {
    name: "delete_knowledge_doc",
    description: "Delete a knowledge document",
    parameters: {
      id: { type: "string", description: "Document ID", required: true },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("id", params.id);

      if (error) throw new Error(error.message);
      return { success: true, deletedId: params.id };
    },
  },

  // ============================================
  // PERPLEXITY RESEARCH
  // NOTE: Supermemory tools removed — provided by OpenClaw Supermemory plugin
  // (supermemory_store, supermemory_search, supermemory_forget, supermemory_profile)
  // ============================================
  {
    name: "research_topic",
    description: "Research a topic using Perplexity AI",
    parameters: {
      query: { type: "string", description: "Research query", required: true },
    },
    execute: async (params) => {
      const apiKey = process.env.PERPLEXITY_API_KEY;

      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content:
                "You are a research assistant for B2B sales and marketing. Provide concise, actionable insights.",
            },
            { role: "user", content: params.query },
          ],
          max_tokens: 1000,
        }),
      });

      if (!res.ok) throw new Error(`Perplexity API error: ${res.status}`);

      const data = await res.json();
      return {
        answer: data.choices?.[0]?.message?.content,
        citations: data.citations,
      };
    },
  },
];

// ============================================
// TOOL EXECUTOR
// ============================================

export async function executeTool(
  name: string,
  params: Record<string, any>
): Promise<any> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return await tool.execute(params);
}

export function getToolDescriptions(): string {
  return tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  Parameters: ${Object.entries(
          t.parameters
        )
          .map(
            ([k, v]) =>
              `${k} (${v.type}${v.required ? ", required" : ""})`
          )
          .join(", ")}`
    )
    .join("\n");
}

const agentToolsModule = { tools, executeTool, getToolDescriptions };

export default agentToolsModule;
