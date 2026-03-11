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

const agentTools = { tools, executeTool, getToolDescriptions };

export default agentTools;
