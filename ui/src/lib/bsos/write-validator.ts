/**
 * BSOS Write Validation Middleware
 * Enforces contamination scope for all Supermemory writes.
 * Skills must NOT accidentally write to containers outside their declared scope.
 * This is the core safety layer for memory isolation.
 */

import type { SkillWriteScope, ContaminationCheck } from "./types";

/**
 * Validate that a proposed write target is within the skill's declared scope.
 * Returns a ContaminationCheck result.
 */
export function validateWriteScope(
  skillId: string,
  declaredScope: SkillWriteScope,
  targetContainerId: string,
  targetCompanyId: string
): ContaminationCheck {
  const allowed = declaredScope.allowedContainerIds || [];
  const allowedCompanies = declaredScope.allowedCompanyIds || [];

  // Check company scope
  if (
    allowedCompanies.length > 0 &&
    !allowedCompanies.includes(targetCompanyId)
  ) {
    return {
      allowed: false,
      reason: `Skill ${skillId} attempted cross-company write to company ${targetCompanyId}`,
      violation: "cross_company",
    };
  }

  // Check container scope
  if (allowed.length > 0 && !allowed.includes(targetContainerId)) {
    return {
      allowed: false,
      reason: `Skill ${skillId} attempted out-of-scope write to container ${targetContainerId}`,
      violation: "out_of_scope_container",
    };
  }

  return { allowed: true, reason: null, violation: null };
}

/**
 * Middleware wrapper: validates scope before executing a write operation.
 * Throws if the write is not allowed.
 */
export async function withWriteValidation<T>(
  skillId: string,
  declaredScope: SkillWriteScope,
  targetContainerId: string,
  targetCompanyId: string,
  writeOp: () => Promise<T>
): Promise<T> {
  const check = validateWriteScope(
    skillId,
    declaredScope,
    targetContainerId,
    targetCompanyId
  );

  if (!check.allowed) {
    throw new Error(
      `[WriteValidator] SCOPE VIOLATION — ${check.reason} [violation=${check.violation}]`
    );
  }

  return writeOp();
}

/**
 * Validate a batch of write operations.
 * Returns the first violation found, or null if all are allowed.
 */
export function validateBatchWrites(
  skillId: string,
  declaredScope: SkillWriteScope,
  writes: Array<{ containerId: string; companyId: string }>
): ContaminationCheck | null {
  for (const write of writes) {
    const check = validateWriteScope(
      skillId,
      declaredScope,
      write.containerId,
      write.companyId
    );
    if (!check.allowed) {
      return check;
    }
  }
  return null;
}

/**
 * Log a scope violation for audit purposes.
 */
export async function logScopeViolation(
  skillId: string,
  violation: ContaminationCheck,
  companyId: string
): Promise<void> {
  console.error(
    `[BSOS WriteValidator] SCOPE VIOLATION`,
    JSON.stringify({
      skillId,
      companyId,
      violation: violation.violation,
      reason: violation.reason,
      timestamp: new Date().toISOString(),
    })
  );
  // In production, this would also write to an audit log table
}
