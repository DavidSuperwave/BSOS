/**
 * Agent Tools Library
 *
 * Tools that Julian can call from the chat interface.
 * Each tool has a name, description, and execute function.
 * All tools accept companyId to scope data access.
 */

import { createClient } from "@supabase/supabase-js";

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

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

export interface Tool {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  execute: (params: Record<string, any>) => Promise<any>;
}

/**
 * Get PlusVibe credentials for a company, falling back to env vars.
 */
async function getPlusVibeKeys(companyId?: string) {
  if (companyId) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("companies")
      .select(
        "integration_credentials, plusvibe_api_key, plusvibe_workspace_id"
      )
      .eq("id", companyId)
      .single();

    if (data) {
      const row = data as any;
      const apiKey =
        row.integration_credentials?.plusvibe_api_key ||
        row.plusvibe_api_key ||
        process.env.PLUSVIBE_API_KEY;
      const workspaceId =
        row.integration_credentials?.plusvibe_workspace_id ||
        row.plusvibe_workspace_id ||
        process.env.PLUSVIBE_WORKSPACE_ID;
      return { apiKey, workspaceId };
    }
  }

  return {
    apiKey: process.env.PLUSVIBE_API_KEY,
    workspaceId: process.env.PLUSVIBE_WORKSPACE_ID,
  };
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
      const { apiKey, workspaceId } = await getPlusVibeKeys(params.companyId);

      const res = await fetch(
        `${PLUSVIBE_BASE}/campaign/list?workspace_id=${workspaceId}`,
        {
          headers: {
            "x-api-key": apiKey!,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) throw new Error(`PlusVibe API error: ${res.status}`);

      const data = await res.json();
      let campaigns = Array.isArray(data)
        ? data
        : data.value || data.data || [];

      if (params.status) {
        campaigns = campaigns.filter(
          (c: any) => c.status === params.status
        );
      }

      if (params.limit) {
        campaigns = campaigns.slice(0, params.limit);
      }

      return {
        count: campaigns.length,
        campaigns: campaigns.map((c: any) => ({
          id: c._id || c.id,
          name: c.name,
          status: c.status,
          createdAt: c.created_at,
          lastSent: c.last_lead_sent,
          lastReplied: c.last_lead_replied,
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
      const { apiKey, workspaceId } = await getPlusVibeKeys(params.companyId);

      const listRes = await fetch(
        `${PLUSVIBE_BASE}/campaign/list?workspace_id=${workspaceId}`,
        {
          headers: {
            "x-api-key": apiKey!,
            "Content-Type": "application/json",
          },
        }
      );
      const listData = await listRes.json();
      const campaigns = Array.isArray(listData)
        ? listData
        : listData.value || [];
      const campaign = campaigns.find(
        (c: any) =>
          c._id === params.campaignId || c.id === params.campaignId
      );

      if (!campaign) throw new Error("Campaign not found");
      return campaign;
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

export default { tools, executeTool, getToolDescriptions };
