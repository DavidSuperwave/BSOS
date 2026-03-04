import { getAdminClient } from "./db";

export type ArmType =
  | "subject_hook_type"
  | "send_time_window"
  | "sequence_length"
  | "cta_style"
  | "icp_segment";

export interface ArmSelectionResult {
  arm_name: string;
  exploration_reason?: string;
}

export interface ArmStatsResponse {
  arms: Array<{
    name: string;
    alpha: number;
    beta: number;
    mean: number;
    observations: number;
  }>;
}

const DEFAULT_ARM_VALUES: Record<ArmType, string[]> = {
  subject_hook_type: ["pain_point", "social_proof", "curiosity", "direct_offer"],
  send_time_window: ["early_morning", "morning", "afternoon", "evening"],
  sequence_length: ["3_touch", "5_touch", "7_touch", "10_touch"],
  cta_style: ["soft_question", "direct_book", "resource_offer", "breakup"],
  icp_segment: ["enterprise", "mid_market", "smb", "founder_led"],
};

const BETA_PRIOR_ALPHA = 1;
const BETA_PRIOR_BETA = 1;

const randomFloat = (): number => Math.random();

const gammaSample = (shape: number): number => {
  if (shape <= 0) return 0;
  if (shape < 1) {
    return gammaSample(shape + 1) * Math.pow(randomFloat(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x = 0;
    let y = 0;
    let rds = 0;
    do {
      x = randomFloat() * 2 - 1;
      y = randomFloat() * 2 - 1;
      rds = x * x + y * y;
    } while (rds === 0 || rds > 1);

    const normal = x * Math.sqrt((-2 * Math.log(rds)) / rds);
    const v = Math.pow(1 + c * normal, 3);
    if (v <= 0) continue;

    const u = randomFloat();
    if (u < 1 - 0.0331 * Math.pow(normal, 4)) return d * v;
    if (Math.log(u) < 0.5 * normal * normal + d * (1 - v + Math.log(v))) return d * v;
  }
};

const betaSample = (alpha: number, beta: number): number => {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  if (x + y === 0) return 0.5;
  return x / (x + y);
};

async function logTrace(companyId: string, action: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await getAdminClient();
    await supabase.from("agent_trace_logs").insert({
      company_id: companyId,
      action,
      payload,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Initialize bandit priors for all configured arm types.
 */
export async function initializePriors(companyId: string): Promise<void> {
  const supabase = await getAdminClient();

  try {
    for (const [armType, armNames] of Object.entries(DEFAULT_ARM_VALUES) as [ArmType, string[]][]) {
      for (const armName of armNames) {
        const { data: existing } = await supabase
          .from("bandit_states")
          .select("id")
          .eq("company_id", companyId)
          .eq("arm_type", armType)
          .eq("arm_name", armName)
          .maybeSingle();

        if (existing?.id) continue;

        const { data: benchmark } = await supabase
          .from("bandit_states")
          .select("alpha,beta,total_observations")
          .eq("company_id", "shared:gtm:benchmarks")
          .eq("arm_type", armType)
          .eq("arm_name", armName)
          .maybeSingle();

        await supabase.from("bandit_states").insert({
          company_id: companyId,
          arm_type: armType,
          arm_name: armName,
          alpha: Number(benchmark?.alpha ?? BETA_PRIOR_ALPHA),
          beta: Number(benchmark?.beta ?? BETA_PRIOR_BETA),
          total_observations: Number(benchmark?.total_observations ?? 0),
          updated_at: new Date().toISOString(),
        });
      }
    }

    await logTrace(companyId, "bandit_initialize_priors", { status: "ok" });
  } catch (error) {
    await logTrace(companyId, "bandit_initialize_priors_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Select an arm via Thompson Sampling.
 */
export async function selectArm(companyId: string, armType: ArmType, context?: Record<string, unknown>): Promise<ArmSelectionResult> {
  const supabase = await getAdminClient();

  try {
    await initializePriors(companyId);

    const useBenchmarks = await shouldExplore(companyId);
    const sourceCompanyId = useBenchmarks ? "shared:gtm:benchmarks" : companyId;

    const { data: rows, error } = await supabase
      .from("bandit_states")
      .select("arm_name,alpha,beta,total_observations")
      .eq("company_id", sourceCompanyId)
      .eq("arm_type", armType);

    if (error || !rows?.length) {
      const fallback = DEFAULT_ARM_VALUES[armType][0];
      return {
        arm_name: fallback,
        exploration_reason: "Fallback arm selected due to missing state.",
      };
    }

    let bestArm = rows[0].arm_name as string;
    let bestSample = -1;

    for (const row of rows as Array<{ arm_name: string; alpha: number; beta: number }>) {
      const sampled = betaSample(Math.max(0.001, Number(row.alpha ?? 1)), Math.max(0.001, Number(row.beta ?? 1)));
      if (sampled > bestSample) {
        bestSample = sampled;
        bestArm = row.arm_name;
      }
    }

    const result: ArmSelectionResult = {
      arm_name: bestArm,
      exploration_reason: useBenchmarks
        ? "Using shared benchmark priors while observations are below activation threshold."
        : undefined,
    };

    await logTrace(companyId, "bandit_select_arm", {
      armType,
      result,
      context: context ?? null,
      sourceCompanyId,
    });

    return result;
  } catch (error) {
    await logTrace(companyId, "bandit_select_arm_error", {
      armType,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return { arm_name: DEFAULT_ARM_VALUES[armType][0], exploration_reason: "Fallback due to transient error." };
  }
}

/**
 * Update arm posterior after observing reward.
 */
export async function updateArm(
  companyId: string,
  armType: ArmType,
  armName: string,
  reward: 0 | 1,
): Promise<void> {
  const supabase = await getAdminClient();

  try {
    const { data: existing } = await supabase
      .from("bandit_states")
      .select("id,alpha,beta,total_observations")
      .eq("company_id", companyId)
      .eq("arm_type", armType)
      .eq("arm_name", armName)
      .maybeSingle();

    if (!existing?.id) {
      await supabase.from("bandit_states").insert({
        company_id: companyId,
        arm_type: armType,
        arm_name: armName,
        alpha: BETA_PRIOR_ALPHA + (reward === 1 ? 1 : 0),
        beta: BETA_PRIOR_BETA + (reward === 0 ? 1 : 0),
        total_observations: 1,
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabase
        .from("bandit_states")
        .update({
          alpha: Number(existing.alpha ?? 1) + (reward === 1 ? 1 : 0),
          beta: Number(existing.beta ?? 1) + (reward === 0 ? 1 : 0),
          total_observations: Number(existing.total_observations ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }

    await logTrace(companyId, "bandit_update_arm", { armType, armName, reward });
  } catch (error) {
    await logTrace(companyId, "bandit_update_arm_error", {
      armType,
      armName,
      reward,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Apply monthly decay to reduce stale historical bias.
 */
export async function applyDecay(companyId: string): Promise<void> {
  const supabase = await getAdminClient();

  try {
    const { data: states } = await supabase
      .from("bandit_states")
      .select("id,alpha,beta")
      .eq("company_id", companyId);

    for (const row of states ?? []) {
      await supabase
        .from("bandit_states")
        .update({
          alpha: Math.max(0.1, Number(row.alpha ?? 1) * 0.95),
          beta: Math.max(0.1, Number(row.beta ?? 1) * 0.95),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    await logTrace(companyId, "bandit_apply_decay", { states: (states ?? []).length });
  } catch (error) {
    await logTrace(companyId, "bandit_apply_decay_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Get bandit arm statistics.
 */
export async function getArmStats(companyId: string, armType?: ArmType): Promise<ArmStatsResponse> {
  const supabase = await getAdminClient();

  try {
    let query = supabase
      .from("bandit_states")
      .select("arm_name,alpha,beta,total_observations,arm_type")
      .eq("company_id", companyId);

    if (armType) {
      query = query.eq("arm_type", armType);
    }

    const { data } = await query;

    const arms = (data ?? []).map((row: any) => {
      const alpha = Number(row.alpha ?? 1);
      const beta = Number(row.beta ?? 1);
      return {
        name: row.arm_name,
        alpha,
        beta,
        mean: alpha / (alpha + beta),
        observations: Number(row.total_observations ?? 0),
      };
    });

    return { arms };
  } catch (error) {
    await logTrace(companyId, "bandit_get_arm_stats_error", {
      armType: armType ?? null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { arms: [] };
  }
}

/**
 * Determine if company is still in minimum-observation exploration phase.
 */
export async function shouldExplore(companyId: string): Promise<boolean> {
  const supabase = await getAdminClient();

  try {
    const { data } = await supabase
      .from("bandit_states")
      .select("total_observations")
      .eq("company_id", companyId);

    const total = (data ?? []).reduce((acc: number, row: any) => acc + Number(row.total_observations ?? 0), 0);
    return total < 50;
  } catch (error) {
    await logTrace(companyId, "bandit_should_explore_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return true;
  }
}
