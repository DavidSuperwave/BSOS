import { getAdminClient } from "@/lib/bsos/db";

/**
 * Campaign HCE component scores.
 */
export interface CampaignEvaluationComponents {
  material: number;
  position_multiplier: number;
  mobility_multiplier: number;
  tempo_bonus: number;
  lead_quality: number;
  sequence_quality: number;
  infrastructure_health: number;
  icp_alignment: number;
  timing_score: number;
  engagement_depth: number;
  list_health: number;
}

/**
 * Campaign evaluation output.
 */
export interface CampaignEvaluationResult {
  score: number;
  grade: string;
  components: CampaignEvaluationComponents;
  factors: string[];
}

/**
 * Company health evaluation output.
 */
export interface CompanyHealthResult {
  composite_score: number;
  health_grade: string;
  component_scores: {
    infrastructure: number;
    campaign_score: number;
    lead_quality: number;
    deliverability: number;
  };
  recommendations: string[];
}

type SupabaseLike = Awaited<ReturnType<typeof getAdminClient>>;

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const avg = (nums: number[]): number => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

async function logTrace(
  supabase: SupabaseLike,
  companyId: string,
  skillName: string,
  inputParams: Record<string, unknown>,
  outputResult: unknown,
  errorMessage?: string,
): Promise<void> {
  try {
    await supabase.from("agent_trace_logs").insert({
      company_id: companyId,
      skill_name: skillName,
      trigger_type: "manual",
      input_params: inputParams,
      output_result: outputResult,
      error: errorMessage ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking logging failure.
  }
}

/**
 * Convert a numeric score to BSOS grade.
 */
export function scoreToGrade(score: number): string {
  const s = clamp(score);
  if (s >= 90) return "A+";
  if (s >= 80) return "A";
  if (s >= 70) return "B+";
  if (s >= 60) return "B";
  if (s >= 50) return "C+";
  if (s >= 40) return "C";
  if (s >= 30) return "D";
  return "F";
}

async function getLeadQuality(supabase: SupabaseLike, companyId: string): Promise<number> {
  const { data, error } = await supabase
    .from("lead_profiles")
    .select("icp_fit_score")
    .eq("company_id", companyId)
    .limit(500);

  if (error || !data?.length) return 50;
  return clamp(avg(data.map((r: { icp_fit_score: number | null }) => Number(r.icp_fit_score ?? 50))));
}

async function getSequenceQuality(supabase: SupabaseLike, companyId: string, campaignId: string): Promise<number> {
  const { data, error } = await supabase
    .from("campaign_copy_analysis")
    .select("overall_score,confidence_score")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data?.length) return 50;
  return clamp(
    avg(
      data.map((r: { overall_score?: number | null; confidence_score?: number | null }) =>
        Number(r.overall_score ?? r.confidence_score ?? 50),
      ),
    ),
  );
}

async function getInfrastructureHealth(supabase: SupabaseLike, companyId: string): Promise<number> {
  const { data, error } = await supabase
    .from("deliverability_snapshots")
    .select("health_score,warmup_health")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data?.length) return 50;
  return clamp(
    avg(
      data.map((r: { health_score?: number | null; warmup_health?: number | null }) =>
        Number(r.health_score ?? r.warmup_health ?? 50),
      ),
    ),
  );
}

/**
 * Evaluate a campaign using HCE layer-1 formula.
 */
export async function evaluateCampaign(companyId: string, campaignId: string): Promise<CampaignEvaluationResult> {
  const supabase = await getAdminClient();

  try {
    const [leadQuality, sequenceQuality, infrastructureHealth] = await Promise.all([
      getLeadQuality(supabase, companyId),
      getSequenceQuality(supabase, companyId, campaignId),
      getInfrastructureHealth(supabase, companyId),
    ]);

    const material = clamp(0.4 * leadQuality + 0.35 * sequenceQuality + 0.25 * infrastructureHealth);

    const { data: trends } = await supabase
      .from("campaign_daily_metrics")
      .select("send_count,open_count,reply_count,bounce_count,meeting_count,metric_date")
      .eq("company_id", companyId)
      .eq("campaign_id", campaignId)
      .order("metric_date", { ascending: false })
      .limit(14);

    const recent = (trends ?? []).slice(0, 7);
    const prior = (trends ?? []).slice(7, 14);

    const recentSends = recent.reduce((a: number, r: any) => a + Number(r.send_count ?? 0), 0);
    const recentOpens = recent.reduce((a: number, r: any) => a + Number(r.open_count ?? 0), 0);
    const recentReplies = recent.reduce((a: number, r: any) => a + Number(r.reply_count ?? 0), 0);
    const recentBounces = recent.reduce((a: number, r: any) => a + Number(r.bounce_count ?? 0), 0);
    const recentMeetings = recent.reduce((a: number, r: any) => a + Number(r.meeting_count ?? 0), 0);
    const activeDays = recent.filter((r: any) => Number(r.send_count ?? 0) > 0).length;

    const openRate = recentSends > 0 ? recentOpens / recentSends : 0.2;
    const replyRate = recentSends > 0 ? recentReplies / recentSends : 0.05;
    const bounceRate = recentSends > 0 ? recentBounces / recentSends : 0.03;

    const icpAlignment = clamp01(leadQuality / 100);
    const timingScore = clamp01(activeDays / 7);
    const engagementDepth = clamp01(avg([openRate, replyRate * 4]));
    const listHealth = clamp01(1 - bounceRate);
    const positionMultiplier = clamp01(avg([icpAlignment, timingScore, engagementDepth, listHealth]));

    const mobilityMultiplier = clamp01(
      avg([
        Math.min(1, recentSends / 2000),
        Math.min(1, activeDays / 7),
        Math.min(1, recentMeetings / 10),
      ]),
    );

    const recentVelocity = recent.reduce((a: number, r: any) => a + Number(r.reply_count ?? 0) + Number(r.meeting_count ?? 0), 0);
    const priorVelocity = prior.reduce((a: number, r: any) => a + Number(r.reply_count ?? 0) + Number(r.meeting_count ?? 0), 0);
    const momentum = priorVelocity <= 0 ? (recentVelocity > 0 ? 1 : 0) : (recentVelocity - priorVelocity) / priorVelocity;
    const tempoBonus = clamp(momentum * 10, -10, 10);

    const score = clamp(material * positionMultiplier * mobilityMultiplier + tempoBonus);
    const grade = scoreToGrade(score);

    const factors: string[] = [];
    if (leadQuality < 60) factors.push("Improve ICP fit quality in lead sourcing.");
    if (sequenceQuality < 60) factors.push("Refresh sequence copy and value proposition clarity.");
    if (infrastructureHealth < 60) factors.push("Stabilize infrastructure and mailbox reputation.");
    if (engagementDepth < 0.3) factors.push("Boost engagement depth with stronger hooks and CTAs.");
    if (mobilityMultiplier < 0.4) factors.push("Expand active sequences/segments/account coverage for better mobility.");
    if (tempoBonus < 0) factors.push("Address negative engagement momentum with rapid test iterations.");

    const result: CampaignEvaluationResult = {
      score,
      grade,
      components: {
        material,
        position_multiplier: positionMultiplier,
        mobility_multiplier: mobilityMultiplier,
        tempo_bonus: tempoBonus,
        lead_quality: leadQuality,
        sequence_quality: sequenceQuality,
        infrastructure_health: infrastructureHealth,
        icp_alignment: icpAlignment,
        timing_score: timingScore,
        engagement_depth: engagementDepth,
        list_health: listHealth,
      },
      factors,
    };

    await logTrace(
      supabase,
      companyId,
      "evaluator.evaluateCampaign",
      { campaignId },
      result,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await logTrace(
      supabase,
      companyId,
      "evaluator.evaluateCampaign",
      { campaignId },
      { fallback: true },
      message,
    );

    return {
      score: 50,
      grade: scoreToGrade(50),
      components: {
        material: 50,
        position_multiplier: 0.5,
        mobility_multiplier: 0.5,
        tempo_bonus: 0,
        lead_quality: 50,
        sequence_quality: 50,
        infrastructure_health: 50,
        icp_alignment: 0.5,
        timing_score: 0.5,
        engagement_depth: 0.5,
        list_health: 0.5,
      },
      factors: ["Evaluation fallback applied due to incomplete data or transient errors."],
    };
  }
}

/**
 * Evaluate company-level composite health for reports.
 */
export async function evaluateCompanyHealth(companyId: string): Promise<CompanyHealthResult> {
  const supabase = await getAdminClient();

  try {
    const [leadQuality, infrastructure] = await Promise.all([
      getLeadQuality(supabase, companyId),
      getInfrastructureHealth(supabase, companyId),
    ]);

    const { data: latestCampaign } = await supabase
      .from("campaign_daily_metrics")
      .select("campaign_id,metric_date")
      .eq("company_id", companyId)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const campaignEval = latestCampaign?.campaign_id
      ? await evaluateCampaign(companyId, latestCampaign.campaign_id)
      : ({ score: 50 } as CampaignEvaluationResult);

    const { data: deliverabilityRows } = await supabase
      .from("deliverability_snapshots")
      .select("inbox_rate,inbox_placement")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);

    const deliverability = clamp(
      avg(
        (deliverabilityRows ?? []).map((r: { inbox_rate?: number | null; inbox_placement?: number | null }) =>
          Number(r.inbox_rate ?? r.inbox_placement ?? 0.8) * 100,
        ),
      ),
    );

    const composite = clamp(
      0.3 * infrastructure + 0.3 * campaignEval.score + 0.2 * leadQuality + 0.2 * deliverability,
    );

    const recommendations: string[] = [];
    if (infrastructure < 70) recommendations.push("Prioritize DNS/authentication and mailbox warmup remediation.");
    if (campaignEval.score < 70) recommendations.push("Iterate campaign structure, targeting, and sequencing cadence.");
    if (leadQuality < 70) recommendations.push("Tighten ICP filtering and suppress low-fit segments.");
    if (deliverability < 75) recommendations.push("Reduce bounce/spam signals and improve domain reputation.");

    const result: CompanyHealthResult = {
      composite_score: composite,
      health_grade: scoreToGrade(composite),
      component_scores: {
        infrastructure,
        campaign_score: campaignEval.score,
        lead_quality: leadQuality,
        deliverability,
      },
      recommendations,
    };

    await logTrace(
      supabase,
      companyId,
      "evaluator.evaluateCompanyHealth",
      { companyId },
      result,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await logTrace(
      supabase,
      companyId,
      "evaluator.evaluateCompanyHealth",
      { companyId },
      { fallback: true },
      message,
    );

    return {
      composite_score: 50,
      health_grade: scoreToGrade(50),
      component_scores: {
        infrastructure: 50,
        campaign_score: 50,
        lead_quality: 50,
        deliverability: 50,
      },
      recommendations: ["Health evaluation fallback applied due to incomplete data or transient errors."],
    };
  }
}
