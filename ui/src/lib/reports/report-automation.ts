import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type ChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "funnel"
  | "scatter"
  | "radar";
type DataSource = "campaigns" | "inbox" | "pipeline" | "events" | "custom";
type DocumentCategory = "playbook" | "report" | "template" | "note";
type DocumentStatus = "draft" | "published" | "archived";

interface ToolContext {
  companyId: string;
  sessionId?: string;
  userId?: string;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ReportAutomationRecord {
  id: string;
  type: "daily_report";
  title: string;
  enabled: boolean;
  reportId: string;
  deliveryHourUtc: number;
  documentTitleTemplate: string;
  documentMarkdownTemplate: string;
  createdAt: string;
  updatedAt: string;
  lastRunOn: string | null;
  lastDocumentId: string | null;
}

interface RunAutomationResult {
  companyId: string;
  automationId: string;
  status: "generated" | "skipped" | "error";
  title: string;
  reportId?: string;
  documentId?: string;
  reason?: string;
}

interface DocumentInsertInput {
  admin: ReturnType<typeof createClient>;
  companyId: string;
  title: string;
  markdown: string;
  reportIds: string[];
  category?: DocumentCategory;
  status?: DocumentStatus;
  userId?: string | null;
}

type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, { description: string }>;
    required?: string[];
  };
};

const VALID_CHART_TYPES = new Set<ChartType>([
  "bar",
  "line",
  "area",
  "pie",
  "donut",
  "funnel",
  "scatter",
  "radar",
]);
const VALID_DATA_SOURCES = new Set<DataSource>([
  "campaigns",
  "inbox",
  "pipeline",
  "events",
  "custom",
]);
const VALID_DOCUMENT_CATEGORIES = new Set<DocumentCategory>([
  "playbook",
  "report",
  "template",
  "note",
]);
const VALID_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  "draft",
  "published",
  "archived",
]);

const REPORT_AUTOMATIONS_SETTINGS_KEY = "report_automations";
const REPORT_TOKEN_REGEX = /\[report:([^\]]+)\]/g;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let adminClient: ReturnType<typeof createClient> | null = null;

function getAdmin() {
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return adminClient;
}

function sanitizeTitle(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return text || fallback;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toObject(value: unknown): Record<string, any> {
  return isObject(value) ? value : {};
}

function normalizeChartType(value: unknown): ChartType | null {
  const text = String(value || "").trim().toLowerCase() as ChartType;
  return VALID_CHART_TYPES.has(text) ? text : null;
}

function normalizeDataSource(value: unknown): DataSource | null {
  const text = String(value || "").trim().toLowerCase() as DataSource;
  return VALID_DATA_SOURCES.has(text) ? text : null;
}

function normalizeCategory(value: unknown): DocumentCategory {
  const text = String(value || "").trim().toLowerCase() as DocumentCategory;
  return VALID_DOCUMENT_CATEGORIES.has(text) ? text : "report";
}

function normalizeStatus(value: unknown): DocumentStatus {
  const text = String(value || "").trim().toLowerCase() as DocumentStatus;
  return VALID_DOCUMENT_STATUSES.has(text) ? text : "published";
}

function normalizeHourUtc(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 8;
  if (!Number.isFinite(numeric)) return 8;
  return Math.min(23, Math.max(0, Math.trunc(numeric)));
}

function extractReportIds(markdown: string, explicitReportIds?: unknown): string[] {
  const fromText = Array.from(markdown.matchAll(REPORT_TOKEN_REGEX)).map((match) => match[1]);
  const fromParams = Array.isArray(explicitReportIds)
    ? explicitReportIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...fromParams, ...fromText]));
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function flushParagraph(
  nodes: Array<Record<string, any>>,
  paragraphLines: string[]
) {
  const text = paragraphLines.join(" ").trim();
  if (!text) return;
  nodes.push({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
}

function flushBulletList(
  nodes: Array<Record<string, any>>,
  bulletLines: string[]
) {
  if (bulletLines.length === 0) return;
  nodes.push({
    type: "bulletList",
    content: bulletLines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      })),
  });
}

export function markdownToStructuredDocument(markdown: string) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const nodes: Array<Record<string, any>> = [];
  const paragraphLines: string[] = [];
  const bulletLines: string[] = [];

  const flushAll = () => {
    flushParagraph(nodes, paragraphLines);
    flushBulletList(nodes, bulletLines);
    paragraphLines.length = 0;
    bulletLines.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      nodes.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2].trim() }],
      });
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph(nodes, paragraphLines);
      paragraphLines.length = 0;
      bulletLines.push(bulletMatch[1].trim());
      continue;
    }

    flushBulletList(nodes, bulletLines);
    bulletLines.length = 0;
    paragraphLines.push(line);
  }

  flushAll();

  return {
    type: "doc",
    content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
  };
}

function renderTemplate(
  template: string,
  values: { date: string; reportTitle: string }
) {
  return template
    .replaceAll("{{date}}", values.date)
    .replaceAll("{{report_title}}", values.reportTitle);
}

function defaultDocumentTemplate(reportTitle: string, reportId: string) {
  return [
    `# ${escapeMarkdownText(reportTitle)}`,
    "",
    `Generated on {{date}}.`,
    "",
    "## Highlights",
    "- Summarize the biggest movement in performance.",
    "- Call out what changed versus the previous day.",
    "- Capture next actions for the GTM team.",
    "",
    "## Live chart",
    `[report:${reportId}]`,
  ].join("\n");
}

async function validateReportIds(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  reportIds: string[]
) {
  const uniqueRefs = Array.from(
    new Set(reportIds.map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (uniqueRefs.length === 0) return [];

  const idRefs = uniqueRefs.filter((value) => UUID_REGEX.test(value));
  const titleRefs = uniqueRefs.filter((value) => !UUID_REGEX.test(value));
  const resolvedIds = new Set<string>();
  const resolvedTitles = new Set<string>();

  if (idRefs.length > 0) {
    const { data, error } = await admin
      .from("reports")
      .select("id")
      .eq("company_id", companyId)
      .in("id", idRefs);
    if (error) {
      throw new Error(error.message || "Failed to validate embedded reports");
    }
    for (const row of data || []) {
      resolvedIds.add(row.id);
    }
  }

  if (titleRefs.length > 0) {
    const { data, error } = await admin
      .from("reports")
      .select("id, title")
      .eq("company_id", companyId)
      .in("title", titleRefs);
    if (error) {
      throw new Error(error.message || "Failed to resolve report titles");
    }
    for (const row of data || []) {
      resolvedIds.add(row.id);
      resolvedTitles.add(row.title);
    }
  }

  const missing = uniqueRefs.filter((value) => {
    if (UUID_REGEX.test(value)) {
      return !resolvedIds.has(value);
    }
    return !resolvedTitles.has(value);
  });
  if (missing.length > 0) {
    throw new Error(`Unknown report references: ${missing.join(", ")}`);
  }

  return Array.from(resolvedIds);
}

async function createReportRecord(opts: {
  admin: ReturnType<typeof createClient>;
  companyId: string;
  title: string;
  description?: string;
  chartType: ChartType;
  dataSource: DataSource;
  queryConfig?: Record<string, any>;
  chartConfig?: Record<string, any>;
  pinned?: boolean;
  userId?: string | null;
}) {
  const { data, error } = await opts.admin
    .from("reports")
    .insert({
      company_id: opts.companyId,
      title: opts.title,
      description: opts.description || null,
      chart_type: opts.chartType,
      data_source: opts.dataSource,
      query_config: opts.queryConfig || {},
      chart_config: opts.chartConfig || {},
      pinned: Boolean(opts.pinned),
      created_by: opts.userId || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create report");
  }

  return data;
}

async function createDocumentRecord(input: DocumentInsertInput) {
  const embeddedReportIds = await validateReportIds(
    input.admin,
    input.companyId,
    input.reportIds
  );
  const { data, error } = await input.admin
    .from("documents")
    .insert({
      company_id: input.companyId,
      title: input.title,
      content: markdownToStructuredDocument(input.markdown),
      embedded_reports: embeddedReportIds,
      category: input.category || "report",
      status: input.status || "published",
      created_by: input.userId || null,
      last_edited_by: input.userId || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create document");
  }

  return data;
}

async function readCompanySettings(
  admin: ReturnType<typeof createClient>,
  companyId: string
) {
  const { data, error } = await admin
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .single();

  if (error) {
    throw new Error(error.message || "Failed to load company settings");
  }

  return toObject(data?.settings);
}

async function writeCompanySettings(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  settings: Record<string, any>
) {
  const { error } = await admin
    .from("companies")
    .update({ settings })
    .eq("id", companyId);

  if (error) {
    throw new Error(error.message || "Failed to update company settings");
  }
}

async function createStatusEvent(opts: {
  admin: ReturnType<typeof createClient>;
  companyId: string;
  sessionId?: string;
  title: string;
  description: string;
  actions?: Array<{ type: "navigate"; label: string; href: string }>;
}) {
  await opts.admin.from("events").insert({
    company_id: opts.companyId,
    session_id: opts.sessionId || null,
    event_type: "status_update",
    title: opts.title,
    description: opts.description,
    priority: "medium",
    actions: opts.actions || [],
  });
}

function listAutomations(settings: Record<string, any>): ReportAutomationRecord[] {
  return Array.isArray(settings[REPORT_AUTOMATIONS_SETTINGS_KEY])
    ? settings[REPORT_AUTOMATIONS_SETTINGS_KEY]
    : [];
}

function buildAutomationRecord(input: {
  id?: string;
  title: string;
  reportId: string;
  deliveryHourUtc: number;
  documentTitleTemplate: string;
  documentMarkdownTemplate: string;
  enabled?: boolean;
  lastRunOn?: string | null;
  lastDocumentId?: string | null;
}) {
  const now = new Date().toISOString();
  return {
    id: input.id || crypto.randomUUID(),
    type: "daily_report" as const,
    title: input.title,
    enabled: input.enabled !== false,
    reportId: input.reportId,
    deliveryHourUtc: input.deliveryHourUtc,
    documentTitleTemplate: input.documentTitleTemplate,
    documentMarkdownTemplate: input.documentMarkdownTemplate,
    createdAt: now,
    updatedAt: now,
    lastRunOn: input.lastRunOn || null,
    lastDocumentId: input.lastDocumentId || null,
  };
}

async function handleCreateReport(
  params: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  const chartType = normalizeChartType(params.chart_type);
  const dataSource = normalizeDataSource(params.data_source);

  if (!params.title || !chartType || !dataSource) {
    return {
      success: false,
      error: "title, chart_type, and data_source are required",
    };
  }

  try {
    const report = await createReportRecord({
      admin: getAdmin(),
      companyId: context.companyId,
      title: sanitizeTitle(params.title, "Untitled report"),
      description: String(params.description || "").trim() || undefined,
      chartType,
      dataSource,
      queryConfig: toObject(params.query_config),
      chartConfig: toObject(params.chart_config),
      pinned: Boolean(params.pinned),
      userId: context.userId || null,
    });

    return {
      success: true,
      data: {
        reportId: report.id,
        title: report.title,
        description: report.description,
        chartType: report.chart_type,
        dataSource: report.data_source,
        pinned: report.pinned,
        url: `/analytics`,
      },
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to create report" };
  }
}

async function handleCreateReportDocument(
  params: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  const title = sanitizeTitle(params.title, "");
  const markdown = String(params.markdown || "").trim();

  if (!title || !markdown) {
    return { success: false, error: "title and markdown are required" };
  }

  try {
    const admin = getAdmin();
    const reportRefs = extractReportIds(markdown, params.report_ids);
    const reportIds = await validateReportIds(admin, context.companyId, reportRefs);
    const document = await createDocumentRecord({
      admin,
      companyId: context.companyId,
      title,
      markdown,
      reportIds,
      category: normalizeCategory(params.category),
      status: normalizeStatus(params.status),
      userId: context.userId || null,
    });

    return {
      success: true,
      data: {
        documentId: document.id,
        title: document.title,
        category: document.category,
        status: document.status,
        reportIds,
        markdown,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to create report document",
    };
  }
}

async function handleScheduleDailyReport(
  params: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  const title = sanitizeTitle(params.title, "");
  if (!title) {
    return { success: false, error: "title is required" };
  }

  try {
    const admin = getAdmin();
    let reportId = String(params.report_id || "").trim();
    let reportTitle = String(params.report_title || title).trim() || title;

    if (!reportId) {
      const chartType = normalizeChartType(params.chart_type);
      const dataSource = normalizeDataSource(params.data_source);
      if (!chartType || !dataSource) {
        return {
          success: false,
          error:
            "Provide report_id or create one by passing report_title, chart_type, and data_source",
        };
      }

      const report = await createReportRecord({
        admin,
        companyId: context.companyId,
        title: reportTitle,
        description: String(params.report_description || "").trim() || undefined,
        chartType,
        dataSource,
        queryConfig: toObject(params.query_config),
        chartConfig: toObject(params.chart_config),
        pinned: Boolean(params.pinned),
        userId: context.userId || null,
      });
      reportId = report.id;
      reportTitle = report.title;
    } else {
      const resolvedReportIds = await validateReportIds(admin, context.companyId, [reportId]);
      if (resolvedReportIds.length === 0) {
        return { success: false, error: "Report not found" };
      }
      reportId = resolvedReportIds[0];
      const { data: existingReport } = await admin
        .from("reports")
        .select("title")
        .eq("id", reportId)
        .eq("company_id", context.companyId)
        .single();
      reportTitle = existingReport?.title || reportTitle;
    }

    const settings = await readCompanySettings(admin, context.companyId);
    const automations = listAutomations(settings);
    const documentTitleTemplate =
      String(params.document_title_template || "").trim() || `${title} - {{date}}`;
    const documentMarkdownTemplate =
      String(params.document_markdown_template || "").trim() ||
      defaultDocumentTemplate(reportTitle, reportId);

    const automation = buildAutomationRecord({
      title,
      reportId,
      deliveryHourUtc: normalizeHourUtc(params.delivery_hour_utc),
      documentTitleTemplate,
      documentMarkdownTemplate,
      enabled: params.enabled !== false,
    });

    await writeCompanySettings(admin, context.companyId, {
      ...settings,
      [REPORT_AUTOMATIONS_SETTINGS_KEY]: [...automations, automation],
    });

    return {
      success: true,
      data: {
        automationId: automation.id,
        title: automation.title,
        reportId,
        deliveryHourUtc: automation.deliveryHourUtc,
        enabled: automation.enabled,
        documentTitleTemplate: automation.documentTitleTemplate,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to schedule daily report",
    };
  }
}

export async function executeReportAutomationTool(
  toolName: string,
  params: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  if (toolName === "create_report") {
    return handleCreateReport(params, context);
  }
  if (toolName === "create_report_document") {
    return handleCreateReportDocument(params, context);
  }
  if (toolName === "schedule_daily_report") {
    return handleScheduleDailyReport(params, context);
  }
  return { success: false, error: `Unknown report automation tool: ${toolName}` };
}

export async function runScheduledReportAutomations(input?: {
  companyId?: string;
  automationId?: string;
  force?: boolean;
  now?: Date;
}) {
  const admin = getAdmin();
  const now = input?.now || new Date();
  const today = now.toISOString().slice(0, 10);
  const currentUtcHour = now.getUTCHours();

  let query = admin
    .from("companies")
    .select("id, name, settings")
    .eq("status", "active");

  if (input?.companyId) {
    query = query.eq("id", input.companyId);
  }

  const { data: companies, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to load companies for report automations");
  }

  const results: RunAutomationResult[] = [];

  for (const company of companies || []) {
    const settings = toObject(company.settings);
    const automations = listAutomations(settings);
    if (automations.length === 0) continue;

    let settingsChanged = false;
    const nextAutomations = [...automations];

    for (let index = 0; index < nextAutomations.length; index += 1) {
      const automation = nextAutomations[index];
      if (automation.type !== "daily_report") continue;
      if (!automation.enabled) continue;
      if (input?.automationId && automation.id !== input.automationId) continue;

      const alreadyRanToday = automation.lastRunOn === today;
      const isDue = currentUtcHour >= normalizeHourUtc(automation.deliveryHourUtc);
      if (!input?.force && (!isDue || alreadyRanToday)) {
        results.push({
          companyId: company.id,
          automationId: automation.id,
          status: "skipped",
          title: automation.title,
          reportId: automation.reportId,
          reason: alreadyRanToday ? "already_ran_today" : "not_due_yet",
        });
        continue;
      }

      try {
        const { data: report, error: reportError } = await admin
          .from("reports")
          .select("*")
          .eq("id", automation.reportId)
          .eq("company_id", company.id)
          .single();

        if (reportError || !report) {
          throw new Error("Scheduled report definition not found");
        }

        const renderedTitle = renderTemplate(automation.documentTitleTemplate, {
          date: today,
          reportTitle: report.title,
        });
        let renderedMarkdown = renderTemplate(automation.documentMarkdownTemplate, {
          date: today,
          reportTitle: report.title,
        });
        if (!renderedMarkdown.includes(`[report:${report.id}]`)) {
          renderedMarkdown = `${renderedMarkdown}\n\n[report:${report.id}]`;
        }

        const document = await createDocumentRecord({
          admin,
          companyId: company.id,
          title: renderedTitle,
          markdown: renderedMarkdown,
          reportIds: [report.id],
          category: "report",
          status: "published",
          userId: null,
        });

        await createStatusEvent({
          admin,
          companyId: company.id,
          title: `${automation.title} is ready`,
          description: `Generated "${renderedTitle}" with the live chart "${report.title}".`,
          actions: [
            { type: "navigate", label: "Open analytics", href: "/analytics" },
            { type: "navigate", label: "Open agent", href: "/" },
          ],
        });

        nextAutomations[index] = {
          ...automation,
          lastRunOn: today,
          lastDocumentId: document.id,
          updatedAt: now.toISOString(),
        };
        settingsChanged = true;

        results.push({
          companyId: company.id,
          automationId: automation.id,
          status: "generated",
          title: automation.title,
          reportId: report.id,
          documentId: document.id,
        });
      } catch (automationError: any) {
        results.push({
          companyId: company.id,
          automationId: automation.id,
          status: "error",
          title: automation.title,
          reportId: automation.reportId,
          reason: automationError?.message || "Failed to run automation",
        });
      }
    }

    if (settingsChanged) {
      await writeCompanySettings(admin, company.id, {
        ...settings,
        [REPORT_AUTOMATIONS_SETTINGS_KEY]: nextAutomations,
      });
    }
  }

  return {
    ranAt: now.toISOString(),
    processed: results.length,
    generated: results.filter((result) => result.status === "generated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}

export const reportAutomationToolDefinitions: ToolDefinition[] = [
  {
    name: "create_report",
    description:
      "Create a reusable live chart report card backed by company data.",
    parameters: {
      properties: {
        title: { description: "Short report title shown in analytics and chat." },
        description: { description: "Optional summary describing what the chart tracks." },
        chart_type: {
          description:
            "Chart type: bar, line, area, pie, donut, funnel, scatter, or radar.",
        },
        data_source: {
          description: "Data source: campaigns, inbox, pipeline, events, or custom.",
        },
        query_config: {
          description:
            "Optional query settings like range or staticData for custom reports.",
        },
        chart_config: { description: "Optional visual config for future chart tuning." },
        pinned: { description: "Whether to pin this report near the top of analytics." },
      },
      required: ["title", "chart_type", "data_source"],
    },
  },
  {
    name: "create_report_document",
    description:
      "Create a rich markdown-style document that can embed live charts with [report:<id>] tokens.",
    parameters: {
      properties: {
        title: { description: "Document title." },
        markdown: { description: "Markdown body for the document." },
        report_ids: {
          description:
            "Optional embedded report ids. You can also embed them directly with [report:<id>] tokens.",
        },
        category: {
          description: "Document category: report, playbook, template, or note.",
        },
        status: { description: "Document status: draft, published, or archived." },
      },
      required: ["title", "markdown"],
    },
  },
  {
    name: "schedule_daily_report",
    description:
      "Schedule a daily background automation that generates a fresh report document.",
    parameters: {
      properties: {
        title: { description: "Automation name shown in chat and events." },
        report_id: {
          description:
            "Existing report id to reference. If omitted, create a new report by also providing report_title, chart_type, and data_source.",
        },
        report_title: {
          description: "Title for the report that should be created for the schedule.",
        },
        report_description: { description: "Optional description for a newly created report." },
        chart_type: {
          description:
            "Required when report_id is omitted. bar, line, area, pie, donut, funnel, scatter, or radar.",
        },
        data_source: {
          description:
            "Required when report_id is omitted. campaigns, inbox, pipeline, events, or custom.",
        },
        query_config: {
          description: "Optional query settings for a newly created report definition.",
        },
        chart_config: {
          description: "Optional chart config for a newly created report definition.",
        },
        document_title_template: {
          description:
            "Daily document title template. Supports {{date}} and {{report_title}}.",
        },
        document_markdown_template: {
          description:
            "Daily markdown template. Supports {{date}} and {{report_title}} and should include [report:<id>] if you want a live chart.",
        },
        delivery_hour_utc: {
          description: "UTC hour (0-23) when the background job should create the daily document.",
        },
        pinned: { description: "Pin a newly created report definition in analytics." },
        enabled: { description: "Set false to save the automation disabled." },
      },
      required: ["title"],
    },
  },
];

export const REPORT_AUTOMATION_TOOL_NAMES = new Set(
  reportAutomationToolDefinitions.map((tool) => tool.name)
);

export function formatReportAutomationToolDescriptions() {
  return reportAutomationToolDefinitions
    .map((tool) => {
      const params = Object.entries(tool.parameters.properties)
        .map(([key, value]) => {
          const required = tool.parameters.required?.includes(key);
          return `- ${key}${required ? " (required)" : ""}: ${value.description}`;
        })
        .join("\n");

      return `${tool.name}\nDescription: ${tool.description}\nParameters:\n${params || "- none"}`;
    })
    .join("\n\n");
}
