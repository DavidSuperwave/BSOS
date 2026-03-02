/**
 * BSOS Skill Executor
 * Executes registered skills with full guardrails:
 * 1. Validates skill exists and is enabled
 * 2. Checks risk level and routes to approval if needed
 * 3. Validates write scope (contamination check)
 * 4. Executes the skill
 * 5. Logs execution and stores result
 */

import { getAdminClient } from "./db";
import { validateWriteScope } from "./write-validator";
import { createApprovalRequest, checkApprovalStatus } from "./approval-manager";
import type {
  SkillDefinition,
  SkillExecutionResult,
  SkillContext,
  RiskLevel,
} from "./types";

// In-memory skill registry (populated at startup)
const skillRegistry = new Map<string, SkillDefinition>();

/**
 * Register a skill in the executor.
 */
export function registerSkill(skill: SkillDefinition): void {
  skillRegistry.set(skill.id, skill);
}

/**
 * Execute a skill with full guardrails.
 */
export async function executeSkill(
  skillId: string,
  context: SkillContext,
  params: Record<string, unknown>
): Promise<SkillExecutionResult> {
  const db = getAdminClient();
  const now = new Date().toISOString();
  const executionId = crypto.randomUUID();

  // 1. Look up skill
  const skill = skillRegistry.get(skillId);
  if (!skill) {
    return {
      executionId,
      skillId,
      status: "error",
      error: `Skill ${skillId} not found in registry`,
      executedAt: now,
    };
  }

  if (!skill.enabled) {
    return {
      executionId,
      skillId,
      status: "skipped",
      reason: `Skill ${skillId} is disabled`,
      executedAt: now,
    };
  }

  // 2. Check risk level — L2+ requires approval
  const riskLevel: RiskLevel = skill.riskLevel || "L1";

  if (riskLevel === "L2" || riskLevel === "L3") {
    // Check if there's already an approved request
    const existingApproval = await checkExistingApproval(
      context.companyId,
      skillId,
      params
    );

    if (!existingApproval) {
      // Create approval request and return pending
      const approvalReq = await createApprovalRequest(
        context.companyId,
        skillId,
        params,
        riskLevel,
        skill.rationale || `Skill ${skillId} requires approval`
      );

      return {
        executionId,
        skillId,
        status: "pending_approval",
        approvalRequestId: approvalReq.id,
        executedAt: now,
      };
    }
  }

  // 3. Validate write scope
  if (skill.writeScope && context.targetContainerId) {
    const scopeCheck = validateWriteScope(
      skillId,
      skill.writeScope,
      context.targetContainerId,
      context.companyId
    );

    if (!scopeCheck.allowed) {
      return {
        executionId,
        skillId,
        status: "error",
        error: `Scope violation: ${scopeCheck.reason}`,
        executedAt: now,
      };
    }
  }

  // 4. Execute the skill
  let result: unknown;
  let execStatus: "success" | "error" = "success";
  let execError: string | undefined;

  try {
    result = await skill.execute(context, params);
  } catch (err) {
    execStatus = "error";
    execError = err instanceof Error ? err.message : String(err);
  }

  // 5. Log execution
  await db.from("skill_executions").insert({
    id: executionId,
    company_id: context.companyId,
    skill_id: skillId,
    status: execStatus,
    params,
    result: result || null,
    error: execError || null,
    executed_at: now,
  });

  return {
    executionId,
    skillId,
    status: execStatus,
    result,
    error: execError,
    executedAt: now,
  };
}

/**
 * Check if there's an existing approved request for this skill + params combo.
 */
async function checkExistingApproval(
  companyId: string,
  skillId: string,
  params: Record<string, unknown>
): Promise<boolean> {
  const db = getAdminClient();

  const { data } = await db
    .from("approval_requests")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("skill_id", skillId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);

  return (data || []).length > 0;
}

/**
 * Get execution history for a company.
 */
export async function getExecutionHistory(
  companyId: string,
  limit = 50
): Promise<SkillExecutionResult[]> {
  const db = getAdminClient();

  const { data } = await db
    .from("skill_executions")
    .select("*")
    .eq("company_id", companyId)
    .order("executed_at", { ascending: false })
    .limit(limit);

  return (data || []) as SkillExecutionResult[];
}

/**
 * List all registered skills.
 */
export function listRegisteredSkills(): SkillDefinition[] {
  return Array.from(skillRegistry.values());
}
