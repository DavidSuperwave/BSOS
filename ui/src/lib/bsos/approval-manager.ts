/**
 * BSOS Approval Manager
 * Human-in-the-loop approval system for agent actions.
 * Agent must SUGGEST, never act unilaterally on day-to-day issues.
 * L2+ actions require explicit approval before execution.
 */

import { getAdminClient } from "./db";
import type { ApprovalRequest, ApprovalStatus, RiskLevel } from "./types";

/**
 * Create an approval request for a proposed agent action.
 * The action will NOT execute until approved.
 */
export async function createApprovalRequest(
  companyId: string,
  skillId: string,
  proposedAction: object,
  riskLevel: RiskLevel,
  rationale: string
): Promise<ApprovalRequest> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("approval_requests")
    .insert({
      company_id: companyId,
      skill_id: skillId,
      proposed_action: proposedAction,
      risk_level: riskLevel,
      rationale,
      status: "pending",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`[ApprovalManager] Failed to create approval request: ${error?.message}`);
  }

  return data as ApprovalRequest;
}

/**
 * Check if an approval request has been approved.
 */
export async function checkApprovalStatus(
  requestId: string
): Promise<ApprovalStatus> {
  const db = getAdminClient();

  const { data, error } = await db
    .from("approval_requests")
    .select("status, approved_at, rejected_at, rejection_reason")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    throw new Error(`[ApprovalManager] Failed to check approval status: ${error?.message}`);
  }

  return data.status as ApprovalStatus;
}

/**
 * Approve an action request (called by human operator or admin UI).
 */
export async function approveAction(
  requestId: string,
  approvedBy: string
): Promise<void> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  const { error } = await db
    .from("approval_requests")
    .update({
      status: "approved",
      approved_at: now,
      approved_by: approvedBy,
      updated_at: now,
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(`[ApprovalManager] Failed to approve action: ${error.message}`);
  }
}

/**
 * Reject an action request.
 */
export async function rejectAction(
  requestId: string,
  rejectedBy: string,
  reason: string
): Promise<void> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  const { error } = await db
    .from("approval_requests")
    .update({
      status: "rejected",
      rejected_at: now,
      rejected_by: rejectedBy,
      rejection_reason: reason,
      updated_at: now,
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(`[ApprovalManager] Failed to reject action: ${error.message}`);
  }
}

/**
 * Get all pending approval requests for a company.
 */
export async function getPendingApprovals(
  companyId: string
): Promise<ApprovalRequest[]> {
  const db = getAdminClient();

  const { data, error } = await db
    .from("approval_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`[ApprovalManager] Failed to get pending approvals: ${error.message}`);
  }

  return (data || []) as ApprovalRequest[];
}
