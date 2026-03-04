// Preliminary findings report generator
import { getAdminClient } from "@/lib/bsos/db";
import { sendTelegramMessage } from "@/lib/bsos/telegram";
import { evaluateCompanyHealth, scoreToGrade } from "@/lib/chess-engine/evaluator";

export interface PreliminaryReport {
  report_id: string;
  company_id: string;
  generated_at: string;
  scores: {
    infrastructure_score: number;
    campaign_score: number;
    lead_quality_score: number;
    deliverability_score: number;
    composite_score: number;
    health_grade: string;
  };
  sections: {
    executive_summary: any;
    infrastructure_health: any;
    campaign_snapshot: any;
    reply_intelligence: any;
    icp_gap_analysis: any;
    bounce_summary: any;
    deal_attribution: any;
    data_gaps: any;
    recommended_actions: any;
  };
  highlights: Array<{ type: string; title: string; impact: string }>;
  risks: Array<{ type: string; severity: string; detail: string }>;
  recommended_actions: Array<{ priority: number; action: string; owner: string }>;
  lineage: { skill_versions: Record<string, string>; coverage_pct: number };
}

const EXECUTION_ORDER = [
  "copy-analyzer",
  "reply-miner",
  "lead-profiler",
  "bounce-diagnostician",
  "deal-miner",
  "deliverability-assessor",
  "profile-enricher",
  "chess-engine-hce",
] as const;

async function runSkill(companyId: string, skillSlug: string): Promise<any> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("skill_executions")
    .insert({
      company_id: companyId,
      skill_id: skillSlug,
      agent_type: "main",
      status: "queued",
      params: { trigger: "preliminary_report" },
      executed_at: new Date().toISOString(),
    })
    .select("id, company_id, skill_id, status, executed_at, result, error")
    .single();

  if (error) {
    throw new Error(`Skill ${skillSlug} enqueue failed: ${error.message}`);
  }

  return data;
}

function defaultSections() {
  return {
    executive_summary: null,
    infrastructure_health: null,
    campaign_snapshot: null,
    reply_intelligence: null,
    icp_gap_analysis: null,
    bounce_summary: null,
    deal_attribution: null,
    data_gaps: null,
    recommended_actions: null,
  };
}

function mapSkillOutputToSections(skillSlug: string, output: any, sections: PreliminaryReport["sections"]) {
  switch (skillSlug) {
    case "copy-analyzer":
      sections.campaign_snapshot = output;
      break;
    case "reply-miner":
      sections.reply_intelligence = output;
      break;
    case "lead-profiler":
      sections.icp_gap_analysis = output;
      break;
    case "bounce-diagnostician":
      sections.bounce_summary = output;
      break;
    case "deal-miner":
      sections.deal_attribution = output;
      break;
    case "deliverability-assessor":
      sections.infrastructure_health = output;
      break;
    case "profile-enricher":
      sections.data_gaps = output;
      break;
    case "chess-engine-hce":
      sections.executive_summary = output;
      sections.recommended_actions = output?.recommended_actions ?? null;
      break;
    default:
      break;
  }
}

export async function generatePreliminaryReport(companyId: string): Promise<PreliminaryReport> {
  const supabase = getAdminClient();
  const sections = defaultSections();
  const skillVersions: Record<string, string> = {};
  const stepErrors: Array<{ skill: string; error: string }> = [];
  let completedSections = 0;

  for (const skill of EXECUTION_ORDER) {
    try {
      const output = await runSkill(companyId, skill);
      mapSkillOutputToSections(skill, output, sections);
      if (output) {
        completedSections += 1;
      }
      skillVersions[skill] = "v2";
    } catch (error: any) {
      stepErrors.push({ skill, error: error?.message ?? "unknown_error" });
      skillVersions[skill] = "error";
    }
  }

  if (completedSections < 3) {
    throw new Error("Insufficient completed sections to generate preliminary report");
  }

  const health = await evaluateCompanyHealth(companyId);
  const composite = Number(health?.composite_score ?? 0);
  const recommendedActions = (health.recommendations ?? []).map((action, idx) => ({
    priority: idx + 1,
    action,
    owner: "revops",
  }));

  const report: PreliminaryReport = {
    report_id: crypto.randomUUID(),
    company_id: companyId,
    generated_at: new Date().toISOString(),
    scores: {
      infrastructure_score: Number(health?.component_scores?.infrastructure ?? 0),
      campaign_score: Number(health?.component_scores?.campaign_score ?? 0),
      lead_quality_score: Number(health?.component_scores?.lead_quality ?? 0),
      deliverability_score: Number(health?.component_scores?.deliverability ?? 0),
      composite_score: composite,
      health_grade: scoreToGrade(composite),
    },
    sections,
    highlights: [
      { type: "overview", title: "Day 1 baseline established", impact: "Initial GTM health baseline available" },
    ],
    risks: stepErrors.map((e) => ({ type: "execution", severity: "medium", detail: `${e.skill}: ${e.error}` })),
    recommended_actions: recommendedActions,
    lineage: {
      skill_versions: skillVersions,
      coverage_pct: Math.round((completedSections / EXECUTION_ORDER.length) * 100),
    },
  };

  await supabase.from("intelligence_reports").insert({
    company_id: report.company_id,
    report_date: report.generated_at.slice(0, 10),
    report_window_start: report.generated_at,
    report_window_end: report.generated_at,
    health_grade: report.scores.health_grade,
    composite_score: report.scores.composite_score,
    highlights: report.highlights,
    risks: report.risks,
    recommended_actions: report.recommended_actions,
    unresolved_questions: [],
    lineage: report.lineage,
    coverage_pct: report.lineage.coverage_pct,
    skill_version: "v3",
    created_at: report.generated_at,
  });

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, telegram_chat_id")
    .eq("id", companyId)
    .maybeSingle();

  if (company?.telegram_chat_id) {
    await sendTelegramMessage({
      chat_id: company.telegram_chat_id,
      text: formatReportForTelegram(report),
      parse_mode: "HTML",
    });
  }

  return report;
}

export function formatReportForTelegram(report: PreliminaryReport): string {
  const lines: string[] = [];
  lines.push(`Preliminary Findings Report`);
  lines.push(`Company: ${report.company_id}`);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(``);
  lines.push(`Health Grade: ${report.scores.health_grade}`);
  lines.push(`Composite Score: ${report.scores.composite_score}`);
  lines.push(`Infrastructure: ${report.scores.infrastructure_score}`);
  lines.push(`Campaign: ${report.scores.campaign_score}`);
  lines.push(`Lead Quality: ${report.scores.lead_quality_score}`);
  lines.push(`Deliverability: ${report.scores.deliverability_score}`);
  lines.push(``);

  if (report.highlights.length) {
    lines.push(`Highlights:`);
    for (const h of report.highlights.slice(0, 5)) {
      lines.push(`- ${h.title} (${h.impact})`);
    }
    lines.push("");
  }

  if (report.recommended_actions.length) {
    lines.push(`Recommended Actions:`);
    for (const action of report.recommended_actions.slice(0, 5)) {
      lines.push(`${action.priority}. ${action.action} — ${action.owner}`);
    }
    lines.push("");
  }

  lines.push(`Coverage: ${report.lineage.coverage_pct}%`);

  return lines.join("\n");
}
