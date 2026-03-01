import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeSkillSlug, sanitizeAgentType } from "@/lib/skills/common";
import { removeSkillFromAgents } from "@/lib/skills/skill-sync";
import { emitSkillIssueEvent } from "@/lib/action-items";
import type { CompanyAgentType } from "@/lib/skills/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 30, window: 60 });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const access = await requireCompanyAccess(companyId);
  if (access.error) return access.error;

  try {
    const body = await req.json();
    const slug = normalizeSkillSlug(String(body.slug || ""));
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: existingAssignments } = await admin
      .from("company_agent_skill_assignments")
      .select("agent_type")
      .eq("company_id", companyId)
      .eq("skill_slug", slug);

    const existingTypes = Array.from(
      new Set(
        (existingAssignments || [])
          .map((a: any) => sanitizeAgentType(a.agent_type))
          .filter(Boolean)
      )
    ) as CompanyAgentType[];

    if (existingTypes.length === 0) {
      return NextResponse.json(
        { error: "Skill is not installed on any agent" },
        { status: 404 }
      );
    }

    const targetTypes =
      Array.isArray(body.agentTypes) && body.agentTypes.length > 0
        ? (body.agentTypes
            .map((v: any) => sanitizeAgentType(String(v)))
            .filter(Boolean) as CompanyAgentType[])
        : existingTypes;

    const removeResult = await removeSkillFromAgents({
      admin,
      companyId,
      slug,
      agentTypes: targetTypes,
    });

    const { data: skillRow } = await admin
      .from("company_skill_registry")
      .select("name")
      .eq("company_id", companyId)
      .eq("slug", slug)
      .maybeSingle();

    const skillName = skillRow?.name || slug;
    for (const failure of removeResult.failed) {
      try {
        await emitSkillIssueEvent(admin, {
          companyId,
          skillSlug: slug,
          skillName,
          agentType: failure.agentType,
          issueCode: "uninstall_error",
          summary: `Skill remove failed for ${failure.agentType} agent.`,
          details: failure.error,
          priority: "high",
        });
      } catch (eventErr: any) {
        console.warn("[Agent Skills] UNINSTALL event emit failed:", eventErr?.message || eventErr);
      }
    }

    await admin
      .from("company_agent_skill_assignments")
      .delete()
      .eq("company_id", companyId)
      .eq("skill_slug", slug)
      .in("agent_type", targetTypes);

    return NextResponse.json({
      success: true,
      slug,
      removed_from_agents: removeResult.removed.map((x) => x.agentType),
      remove_errors: removeResult.failed,
    });
  } catch (err: any) {
    console.error("[Agent Skills] UNINSTALL error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to uninstall skill" },
      { status: 500 }
    );
  }
}
