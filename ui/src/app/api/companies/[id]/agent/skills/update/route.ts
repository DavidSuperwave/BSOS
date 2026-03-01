import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeSkillSlug, sanitizeAgentType } from "@/lib/skills/common";
import { removeSkillFromAgents, syncSkillToAgents } from "@/lib/skills/skill-sync";
import { buildCompanySkillStatusReport } from "@/lib/skills/skill-status";
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

function resolveAgents(body: any, fallback: CompanyAgentType[]): CompanyAgentType[] {
  if (Array.isArray(body.agentTypes) && body.agentTypes.length > 0) {
    const parsed = body.agentTypes
      .map((v: any) => sanitizeAgentType(String(v)))
      .filter(Boolean) as CompanyAgentType[];
    if (parsed.length > 0) return Array.from(new Set(parsed));
  }
  if (body.agentType) {
    const single = sanitizeAgentType(String(body.agentType));
    if (single) return [single];
  }
  return fallback;
}

function buildMissingSummary(missing: {
  bins: string[];
  env: string[];
  config: string[];
  os: string[];
}) {
  const parts: string[] = [];
  if (missing.env.length > 0) parts.push(`env: ${missing.env.join(", ")}`);
  if (missing.bins.length > 0) parts.push(`bins: ${missing.bins.join(", ")}`);
  if (missing.config.length > 0) parts.push(`config: ${missing.config.join(", ")}`);
  if (missing.os.length > 0) parts.push(`os: ${missing.os.join(", ")}`);
  return parts.length > 0 ? `Missing ${parts.join(" | ")}` : "Skill setup requirements are missing.";
}

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
    const enabled = body.enabled === undefined ? undefined : Boolean(body.enabled);
    const apiKey =
      body.apiKey === undefined || body.apiKey === null ? undefined : String(body.apiKey);
    const envPatch =
      body.env && typeof body.env === "object" ? (body.env as Record<string, string>) : undefined;

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: skill, error: skillError } = await admin
      .from("company_skill_registry")
      .select("*")
      .eq("company_id", companyId)
      .eq("slug", slug)
      .single();

    if (skillError || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const { data: existingAssignments } = await admin
      .from("company_agent_skill_assignments")
      .select("id, agent_type")
      .eq("company_id", companyId)
      .eq("skill_slug", slug);

    const fallbackTargets = (existingAssignments || [])
      .map((a: any) => sanitizeAgentType(a.agent_type))
      .filter(Boolean) as CompanyAgentType[];
    const agentTypes = resolveAgents(body, fallbackTargets.length > 0 ? fallbackTargets : ["main"]);

    await admin
      .from("company_agent_skill_assignments")
      .upsert(
        agentTypes.map((agentType) => ({
          company_id: companyId,
          skill_slug: slug,
          agent_type: agentType,
          enabled: enabled === undefined ? true : enabled,
          install_status:
            enabled === false ? "disabled" : "pending",
          install_message:
            enabled === false ? "Skill disabled" : "Updating skill settings",
        })),
        { onConflict: "company_id,skill_slug,agent_type" }
      );

    const { data: assignmentRows } = await admin
      .from("company_agent_skill_assignments")
      .select("id, agent_type")
      .eq("company_id", companyId)
      .eq("skill_slug", slug)
      .in("agent_type", agentTypes);

    for (const assignment of assignmentRows || []) {
      const currentEnv = await admin
        .from("company_agent_skill_env")
        .select("env")
        .eq("assignment_id", assignment.id)
        .maybeSingle();

      const mergedEnv = {
        ...((currentEnv.data?.env || {}) as Record<string, string>),
        ...(envPatch || {}),
      };

      const envUpdate: Record<string, any> = {
        assignment_id: assignment.id,
        company_id: companyId,
        skill_slug: slug,
        agent_type: assignment.agent_type,
        env: mergedEnv,
      };
      if (apiKey !== undefined) envUpdate.api_key = apiKey;

      await admin
        .from("company_agent_skill_env")
        .upsert(envUpdate, { onConflict: "assignment_id" });
    }

    let syncResult: Awaited<ReturnType<typeof syncSkillToAgents>> = {
      synced: [],
      failed: [],
    };
    let removeResult: Awaited<ReturnType<typeof removeSkillFromAgents>> = {
      removed: [],
      failed: [],
    };

    if (enabled === false) {
      removeResult = await removeSkillFromAgents({
        admin,
        companyId,
        slug,
        agentTypes,
      });
    } else {
      syncResult = await syncSkillToAgents({
        admin,
        companyId,
        slug,
        content: skill.skill_md,
        agentTypes,
      });
    }

    for (const agentType of agentTypes) {
      const syncFailure = syncResult.failed.find((f) => f.agentType === agentType);
      const removeFailure = removeResult.failed.find((f) => f.agentType === agentType);
      const hasError = Boolean(syncFailure || removeFailure);

      await admin
        .from("company_agent_skill_assignments")
        .update({
          enabled: enabled === undefined ? true : enabled,
          install_status:
            enabled === false
              ? hasError
                ? "error"
                : "disabled"
              : hasError
                ? "error"
                : "installed",
          install_message:
            syncFailure?.error ||
            removeFailure?.error ||
            (enabled === false ? "Skill disabled" : "Skill updated"),
          last_error: syncFailure?.error || removeFailure?.error || null,
          installed_at:
            enabled === false || hasError ? null : new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("skill_slug", slug)
        .eq("agent_type", agentType);

      if (hasError) {
        try {
          const isUninstallFlow = enabled === false;
          await emitSkillIssueEvent(admin, {
            companyId,
            skillSlug: slug,
            skillName: skill.name || slug,
            agentType,
            issueCode: isUninstallFlow ? "uninstall_error" : "sync_error",
            summary: isUninstallFlow
              ? `Skill remove failed for ${agentType} agent.`
              : `Skill update failed for ${agentType} agent.`,
            details:
              syncFailure?.error ||
              removeFailure?.error ||
              "Skill operation reported an error.",
            priority: "high",
          });
        } catch (eventErr: any) {
          console.warn("[Agent Skills] UPDATE event emit failed:", eventErr?.message || eventErr);
        }
      }
    }

    // Emit setup reminders only when skill remains enabled.
    if (enabled !== false) {
      try {
        const report = await buildCompanySkillStatusReport({ admin, companyId });
        const reportSkill = (report.skills || []).find((s: any) => s.slug === slug);
        const reportAssignments = (reportSkill?.assignments || []).filter((a: any) =>
          agentTypes.includes(a.agentType)
        );

        for (const assignment of reportAssignments) {
          if (!assignment.enabled || assignment.eligible) continue;
          await emitSkillIssueEvent(admin, {
            companyId,
            skillSlug: slug,
            skillName: skill.name || slug,
            agentType: assignment.agentType,
            issueCode: "missing_requirements",
            summary: `Skill setup is incomplete for ${assignment.agentType} agent.`,
            details: buildMissingSummary(assignment.missing),
            priority: "medium",
          });
        }
      } catch (eventErr: any) {
        console.warn("[Agent Skills] UPDATE setup event emit failed:", eventErr?.message || eventErr);
      }
    }

    return NextResponse.json({
      success: true,
      slug,
      agentTypes,
      enabled: enabled === undefined ? true : enabled,
      sync: syncResult,
      remove: removeResult,
    });
  } catch (err: any) {
    console.error("[Agent Skills] UPDATE error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update skill settings" },
      { status: 500 }
    );
  }
}
