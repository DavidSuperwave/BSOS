import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { executeSkill } from "@/lib/bsos/skill-executor";

/**
 * POST /api/bsos/skills/execute
 * Execute a registered BSOS skill.
 * Body: { company_id, skill_name, input_params, trigger_type? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_id, skill_name, input_params, trigger_type } = body;

  if (!company_id || !skill_name) {
    return NextResponse.json({ error: "company_id and skill_name required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  const execution = await executeSkill(
    skill_name,
    {
      companyId: company_id,
      userId: result.auth.userId,
      triggerType: trigger_type || "manual",
    } as any,
    input_params || {}
  );

  return NextResponse.json(execution);
}
