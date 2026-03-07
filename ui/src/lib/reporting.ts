export type ReportRange = "24h" | "7d" | "30d" | "90d";
export type ReportChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "funnel"
  | "scatter"
  | "radar";
export type ReportDataSource = "campaigns" | "inbox" | "pipeline" | "events" | "custom";

export interface ReportRow {
  id: string;
  company_id: string;
  title: string;
  description?: string | null;
  chart_type: ReportChartType;
  data_source: ReportDataSource;
  query_config?: Record<string, any> | null;
  chart_config?: Record<string, any> | null;
}

export interface ScheduleConfigInput {
  preset?: "hourly" | "daily" | "weekly";
  timeOfDay?: string;
  dayOfWeek?: number;
  timezone?: string;
}

export function resolveRangeStart(range: string | null): string | null {
  const now = new Date();
  if (range === "24h") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "90d") {
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "7d" || !range) {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function toDateKey(ts: string) {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function loadReportData({
  admin,
  companyId,
  report,
  range,
}: {
  admin: any;
  companyId: string;
  report: ReportRow;
  range?: string | null;
}): Promise<any[]> {
  const rangeStart = resolveRangeStart(range || report.query_config?.range || null);
  const dataSource = report.data_source as string;

  let data: any[] = [];

  if (dataSource === "campaigns") {
    let query = admin
      .from("inbox_messages")
      .select("campaign_id, campaign_name, sentiment, created_at")
      .eq("company_id", companyId);
    if (rangeStart) query = query.gte("created_at", rangeStart);
    const { data: rows, error } = await query;
    if (error) throw error;

    const byCampaign = new Map<string, any>();
    for (const row of rows || []) {
      const key = row.campaign_id || row.campaign_name || "unknown";
      const current = byCampaign.get(key) || {
        id: row.campaign_id || null,
        name: row.campaign_name || "Unknown campaign",
        replies: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
      };
      current.replies += 1;
      if (row.sentiment === "positive") current.positive += 1;
      if (row.sentiment === "neutral") current.neutral += 1;
      if (row.sentiment === "negative") current.negative += 1;
      byCampaign.set(key, current);
    }
    data = Array.from(byCampaign.values());
  } else if (dataSource === "inbox") {
    let query = admin
      .from("inbox_messages")
      .select("sentiment, intent, created_at")
      .eq("company_id", companyId);
    if (rangeStart) query = query.gte("created_at", rangeStart);
    const { data: rows, error } = await query;
    if (error) throw error;

    const byDay = new Map<string, any>();
    for (const row of rows || []) {
      const day = toDateKey(row.created_at);
      const current = byDay.get(day) || {
        day,
        replies: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        interested: 0,
      };
      current.replies += 1;
      if (row.sentiment === "positive") current.positive += 1;
      if (row.sentiment === "neutral") current.neutral += 1;
      if (row.sentiment === "negative") current.negative += 1;
      if (row.intent === "interested") current.interested += 1;
      byDay.set(day, current);
    }
    data = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  } else if (dataSource === "pipeline") {
    let query = admin
      .from("pipeline_entries")
      .select("stage_id, value, created_at")
      .eq("company_id", companyId);
    if (rangeStart) query = query.gte("created_at", rangeStart);
    const { data: rows, error } = await query;
    if (error) throw error;

    const stageIds = Array.from(new Set((rows || []).map((row) => row.stage_id).filter(Boolean)));
    const { data: stages } = stageIds.length
      ? await admin.from("pipeline_stages").select("id, name").in("id", stageIds)
      : { data: [] };
    const nameById = new Map((stages || []).map((s: any) => [s.id, s.name]));

    const byStage = new Map<string, any>();
    for (const row of rows || []) {
      const stageId = row.stage_id || "unknown";
      const current = byStage.get(stageId) || {
        stageId,
        stage: nameById.get(stageId) || "Unknown",
        count: 0,
        totalValue: 0,
      };
      current.count += 1;
      current.totalValue += Number(row.value || 0);
      byStage.set(stageId, current);
    }
    data = Array.from(byStage.values());
  } else if (dataSource === "events") {
    let query = admin
      .from("events")
      .select("event_type, priority, created_at")
      .eq("company_id", companyId);
    if (rangeStart) query = query.gte("created_at", rangeStart);
    const { data: rows, error } = await query;
    if (error) throw error;

    const byDay = new Map<string, any>();
    for (const row of rows || []) {
      const day = toDateKey(row.created_at);
      const current = byDay.get(day) || {
        day,
        total: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
      current.total += 1;
      if (row.priority === "high" || row.priority === "urgent") current.high += 1;
      else if (row.priority === "low") current.low += 1;
      else current.medium += 1;
      byDay.set(day, current);
    }
    data = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  } else if (dataSource === "custom") {
    data = Array.isArray(report.query_config?.staticData) ? report.query_config?.staticData : [];
  }

  return data;
}

export function extractEmbeddedReportIdsFromMarkdown(markdown: string): string[] {
  if (!markdown?.trim()) return [];
  const matches = markdown.match(/\[report:([a-zA-Z0-9-]+)\]/g) || [];
  const ids = matches
    .map((match) => match.replace("[report:", "").replace("]", ""))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function collectNumericSums(data: any[]) {
  const totals = new Map<string, number>();
  for (const row of data || []) {
    for (const [key, value] of Object.entries(row || {})) {
      if (typeof value === "number" && Number.isFinite(value)) {
        totals.set(key, (totals.get(key) || 0) + value);
      }
    }
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

export function buildReportMarkdown({
  report,
  data,
  range,
  generatedAt = new Date().toISOString(),
}: {
  report: ReportRow;
  data: any[];
  range?: string | null;
  generatedAt?: string;
}): string {
  const totals = collectNumericSums(data);
  const previewRows = (data || []).slice(0, 8);
  const keys = previewRows.length ? Object.keys(previewRows[0]) : [];
  const header = keys.length ? `| ${keys.join(" | ")} |\n| ${keys.map(() => "---").join(" | ")} |` : "";
  const rows = previewRows
    .map((row) => `| ${keys.map((key) => String(row[key] ?? "")).join(" | ")} |`)
    .join("\n");

  const kpiLines =
    totals.length > 0
      ? totals.map(([key, value]) => `- **${key}**: ${Math.round(value * 100) / 100}`).join("\n")
      : "- No numeric KPIs available for this data slice.";

  return [
    `# ${report.title}`,
    "",
    report.description ? report.description : "Auto-generated report summary.",
    "",
    `- Generated at: ${generatedAt}`,
    `- Data source: ${report.data_source}`,
    `- Range: ${range || report.query_config?.range || "7d"}`,
    `- Rows: ${data.length}`,
    "",
    "## Live Chart",
    `Use this token in editors to embed the live chart: \`[report:${report.id}]\``,
    "",
    "## KPI Summary",
    kpiLines,
    "",
    "## Data Preview",
    header && rows ? `${header}\n${rows}` : "_No rows returned for this report range._",
  ].join("\n");
}

function parseTimeOfDayUtc(timeOfDay: string | undefined): { hour: number; minute: number } {
  const input = String(timeOfDay || "08:00").trim();
  const match = input.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: 8, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function parseDayOfWeek(input: unknown): number {
  const day = Number(input);
  if (!Number.isFinite(day)) return 1;
  const normalized = Math.trunc(day);
  if (normalized < 0 || normalized > 6) return 1;
  return normalized;
}

export function buildCronExpression(config: ScheduleConfigInput): string {
  const preset = config.preset || "daily";
  const { hour, minute } = parseTimeOfDayUtc(config.timeOfDay);
  if (preset === "hourly") {
    return `${minute} * * * *`;
  }
  if (preset === "weekly") {
    const day = parseDayOfWeek(config.dayOfWeek);
    return `${minute} ${hour} * * ${day}`;
  }
  return `${minute} ${hour} * * *`;
}

export function computeNextRunAt(config: ScheduleConfigInput, now = new Date()): Date {
  const preset = config.preset || "daily";
  const { hour, minute } = parseTimeOfDayUtc(config.timeOfDay);
  const next = new Date(now);

  if (preset === "hourly") {
    next.setUTCMinutes(minute, 0, 0);
    if (next <= now) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }

  if (preset === "weekly") {
    const targetDow = parseDayOfWeek(config.dayOfWeek);
    const currentDow = now.getUTCDay();
    let deltaDays = targetDow - currentDow;
    if (deltaDays < 0) deltaDays += 7;
    next.setUTCDate(now.getUTCDate() + deltaDays);
    next.setUTCHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 7);
    }
    return next;
  }

  next.setUTCHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function normalizeAutomationChannels(input: unknown): Array<"inbox" | "slack" | "email"> {
  const list = Array.isArray(input) ? input : ["inbox"];
  const normalized = list
    .map((entry) => String(entry || "").toLowerCase().trim())
    .filter((entry): entry is "inbox" | "slack" | "email" =>
      entry === "inbox" || entry === "slack" || entry === "email"
    );
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ["inbox"];
}
