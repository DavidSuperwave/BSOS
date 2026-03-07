/**
 * Agent Tools Library
 *
 * Tools that Julian can call from the chat interface.
 * Each tool has a name, description, and execute function.
 * All tools accept companyId to scope data access.
 */

import { createClient } from "@supabase/supabase-js";
import {
  buildCronExpression,
  computeNextRunAt,
  extractEmbeddedReportIdsFromMarkdown,
  normalizeAutomationChannels,
} from "@/lib/reporting";

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

async function getReportById(supabase: ReturnType<typeof createClient>, companyId: string, reportId: string) {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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
  // REPORTS, DOCUMENTS, AUTOMATIONS
  // ============================================
  {
    name: "list_reports",
    description: "List saved reports for the active company",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      pinned: {
        type: "boolean",
        description: "Only return pinned reports",
      },
      limit: {
        type: "number",
        description: "Maximum reports to return",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      let query = supabase
        .from("reports")
        .select("*")
        .eq("company_id", params.companyId)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (params.pinned === true) query = query.eq("pinned", true);
      if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
        query = query.limit(Math.max(1, Math.trunc(params.limit)));
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return {
        count: data?.length || 0,
        reports: (data || []).map((report: any) => ({
          id: report.id,
          title: report.title,
          description: report.description,
          chart_type: report.chart_type,
          data_source: report.data_source,
          pinned: report.pinned,
          updated_at: report.updated_at,
        })),
      };
    },
  },
  {
    name: "create_report",
    description: "Create a saved report definition with live chart configuration",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      title: {
        type: "string",
        description: "Report title",
        required: true,
      },
      description: {
        type: "string",
        description: "Optional report description",
      },
      chart_type: {
        type: "string",
        description: "Chart type: bar, line, area, pie, donut, funnel, scatter, radar",
      },
      data_source: {
        type: "string",
        description: "Data source: campaigns, inbox, pipeline, events, custom",
      },
      range: {
        type: "string",
        description: "Range preset: 24h, 7d, 30d, 90d",
      },
      query_config: {
        type: "object",
        description: "Optional report query config JSON",
      },
      chart_config: {
        type: "object",
        description: "Optional chart configuration JSON",
      },
      pinned: {
        type: "boolean",
        description: "Whether to pin this report",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const chartType = String(params.chart_type || "line");
      const dataSource = String(params.data_source || "inbox");
      const queryConfig =
        params.query_config && typeof params.query_config === "object"
          ? { ...params.query_config }
          : {};

      if (params.range && !queryConfig.range) {
        queryConfig.range = String(params.range);
      }

      const { data, error } = await supabase
        .from("reports")
        .insert({
          company_id: params.companyId,
          title: params.title,
          description: params.description || null,
          chart_type: chartType,
          data_source: dataSource,
          query_config: queryConfig,
          chart_config:
            params.chart_config && typeof params.chart_config === "object"
              ? params.chart_config
              : {},
          pinned: Boolean(params.pinned),
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return {
        id: data.id,
        title: data.title,
        chart_type: data.chart_type,
        data_source: data.data_source,
        range: data.query_config?.range || "7d",
      };
    },
  },
  {
    name: "create_markdown_document",
    description: "Create a rich markdown document with embedded live report references",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      title: {
        type: "string",
        description: "Document title",
        required: true,
      },
      markdown: {
        type: "string",
        description: "Document markdown content. Use [report:<id>] tokens to embed live charts.",
        required: true,
      },
      category: {
        type: "string",
        description: "Category: playbook, report, template, note",
      },
      status: {
        type: "string",
        description: "Status: draft, published, archived",
      },
      embeddedReportIds: {
        type: "array",
        description: "Optional explicit report IDs. Auto-detected from markdown when omitted.",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const markdown = String(params.markdown || "").trim();
      if (!markdown) throw new Error("markdown is required");

      const providedReportIds = Array.isArray(params.embeddedReportIds)
        ? params.embeddedReportIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];
      const parsedReportIds = extractEmbeddedReportIdsFromMarkdown(markdown);
      const embeddedReportIds = Array.from(new Set([...providedReportIds, ...parsedReportIds]));

      const { data, error } = await supabase
        .from("documents")
        .insert({
          company_id: params.companyId,
          title: params.title,
          content: markdown,
          embedded_reports: embeddedReportIds,
          category: params.category || "report",
          status: params.status || "draft",
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return {
        id: data.id,
        title: data.title,
        category: data.category,
        status: data.status,
        embedded_reports: data.embedded_reports || [],
      };
    },
  },
  {
    name: "create_report_automation",
    description: "Create a scheduled background automation for report/document delivery",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      name: {
        type: "string",
        description: "Automation name",
        required: true,
      },
      description: {
        type: "string",
        description: "Optional automation description",
      },
      reportId: {
        type: "string",
        description: "Report ID to generate on each run",
      },
      documentId: {
        type: "string",
        description: "Optional markdown document ID to include",
      },
      range: {
        type: "string",
        description: "Data range preset for report runs: 24h, 7d, 30d, 90d",
      },
      schedulePreset: {
        type: "string",
        description: "Schedule preset: hourly, daily, weekly",
      },
      timeOfDayUtc: {
        type: "string",
        description: "UTC time HH:mm for daily/weekly schedules",
      },
      dayOfWeek: {
        type: "number",
        description: "0-6 (Sun-Sat), used when schedulePreset is weekly",
      },
      timezone: {
        type: "string",
        description: "Timezone label for metadata (execution uses UTC in current version)",
      },
      channels: {
        type: "array",
        description: "Delivery channels: inbox, slack, email",
      },
      slackWebhookUrl: {
        type: "string",
        description: "Slack incoming webhook URL (required if slack channel used and no company default exists)",
      },
      slackChannel: {
        type: "string",
        description: "Optional Slack channel label to include in payload",
      },
      emailTo: {
        type: "string",
        description: "Optional email recipient metadata (email delivery is currently logged only)",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const channels = normalizeAutomationChannels(params.channels);
      const schedule = {
        preset: (params.schedulePreset || "daily") as "hourly" | "daily" | "weekly",
        timeOfDay: params.timeOfDayUtc || "08:00",
        dayOfWeek:
          typeof params.dayOfWeek === "number" && Number.isFinite(params.dayOfWeek)
            ? Math.trunc(params.dayOfWeek)
            : undefined,
        timezone: params.timezone || "UTC",
      };

      if (!params.reportId && !params.documentId) {
        throw new Error("At least one of reportId or documentId is required");
      }

      if (params.reportId) {
        const report = await getReportById(supabase, params.companyId, params.reportId);
        if (!report) {
          throw new Error("reportId was not found for this company");
        }
      }

      const cronExpression = buildCronExpression(schedule);
      const nextRunAt = computeNextRunAt(schedule);
      const config = {
        kind: "report_automation",
        reportId: params.reportId || null,
        documentId: params.documentId || null,
        range: params.range || "7d",
        channels,
        schedule,
        delivery: {
          slackWebhookUrl: params.slackWebhookUrl || null,
          slackChannel: params.slackChannel || null,
          emailTo: params.emailTo || null,
        },
      };

      const { data, error } = await supabase
        .from("scheduled_jobs")
        .insert({
          company_id: params.companyId,
          name: params.name,
          description: params.description || null,
          cron_expression: cronExpression,
          job_type: "custom",
          config,
          status: "active",
          next_run_at: nextRunAt.toISOString(),
          run_count: 0,
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return {
        id: data.id,
        name: data.name,
        status: data.status,
        next_run_at: data.next_run_at,
        cron_expression: data.cron_expression,
        channels,
      };
    },
  },
  {
    name: "list_report_automations",
    description: "List scheduled report/document automations",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      status: {
        type: "string",
        description: "Filter by status: active, paused, error",
      },
      limit: {
        type: "number",
        description: "Maximum rows to return",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      let query = supabase
        .from("scheduled_jobs")
        .select("*")
        .eq("company_id", params.companyId)
        .order("next_run_at", { ascending: true });

      if (params.status) query = query.eq("status", String(params.status));
      if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
        query = query.limit(Math.max(1, Math.trunc(params.limit)));
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const automations = (data || []).filter((job: any) => job?.config?.kind === "report_automation");
      return {
        count: automations.length,
        automations: automations.map((job: any) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          next_run_at: job.next_run_at,
          last_run_at: job.last_run_at,
          run_count: job.run_count,
          channels: Array.isArray(job.config?.channels) ? job.config.channels : [],
          reportId: job.config?.reportId || null,
          documentId: job.config?.documentId || null,
        })),
      };
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
