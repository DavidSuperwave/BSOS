import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { resolveApproval } from "@/lib/bsos/approval-manager";
import { executeApprovedAction } from "@/lib/bsos/skill-executor";

/**
 * PATCH /api/bsos/approvals/[id]
 * Approve or reject a pending approval.
 * Body: { status: "approved" | "rejected", feedback?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, feedback } = body;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  try {
    await resolveApproval(id, {
      status,
      resolved_by: auth.userId,
      feedback,
    });

    // If approved, execute the action
    let executionResult = null;
    if (status === "approved") {
      executionResult = await executeApprovedAction(id);
    }

    return NextResponse.json({
      resolved: true,
      status,
      execution: executionResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
