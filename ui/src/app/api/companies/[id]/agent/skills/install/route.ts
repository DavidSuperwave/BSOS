import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeSkillSlug, sanitizeAgentType } from "@/lib/skills/common";
import { parseSkillFrontmatter } from "@/lib/skills/frontmatter";
import { installSkillOnCompanyContainer } from "@/lib/skills/skill-installer";
import { syncSkillToAgents } from "@/lib/skills/skill-sync";
import { buildCompanySkillStatusReport } from "@/lib/skills/skill-status";
import { emitSkillIssueEvent } from "@/lib/action-items";
import { COMPANY_AGENT_TYPES, type CompanyAgentType, type SkillInstallSpec } from "@/lib/skills/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 20, window: 60 });

function resolveTargetAgents(raw: unknown): CompanyAgentType[] {
  if (!Array.isArray(raw) || raw.length === 0) return ["main"];
  const out: CompanyAgentType[] = [];
  for (const entry of raw) {
    const normalized = sanitizeAgentType(String(entry));
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out.length > 0 ? out : ["main"];
}

function resolveInstaller(specs: SkillInstallSpec[] | undefined, installId: string | null): SkillInstallSpec | null {
  if (!specs || specs.length === 0) return null;
  const platform = process.platform;
  const eligible = specs.filter((spec) => !spec.os || spec.os.length === 0 || spec.os.includes(platform));
  if (eligible.length === 0) return null;
  if (installId) {
    return eligible.find((spec, idx) => (spec.id || `${spec.kind}-${idx}`) === installId) || null;
  }
  if (eligible.length === 1) return eligible[0];
  const node = eligible.find((x) => x.kind === "node");
  return node || eligible[0];
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
    const admin = getAdmin();
    const body = await req.json();
    const slug = normalizeSkillSlug(String(body.slug || ""));
    const targetAgents = resolveTargetAgents(body.agentTypes);
    const installId = body.installId ? String(body.installId) : null;

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const { data: skill, error: skillError } = await admin
      .from("company_skill_registry")
      .select("*")
      .eq("company_id", companyId)
      .eq("slug", slug)
      .single();

    if (skillError || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const parsed = parseSkillFrontmatter(skill.skill_md || "");
    const installSpec = resolveInstaller(parsed.metadata?.install, installId);

    await admin
      .from("company_agent_skill_assignments")
      .upsert(
        targetAgents.map((agentType) => ({
          company_id: companyId,
          skill_slug: slug,
          agent_type: agentType,
          enabled: true,
          install_status: "pending",
          install_message: installSpec ? "Installing dependencies..." : "Syncing skill files...",
          installer_id: installSpec?.id || null,
        })),
        { onConflict: "company_id,skill_slug,agent_type" }
      );

    const { data: assignmentRows } = await admin
      .from("company_agent_skill_assignments")
      .select("id, agent_type")
      .eq("company_id", companyId)
      .eq("skill_slug", slug)
      .in("agent_type", targetAgents);

    for (const row of assignmentRows || []) {
      await admin
        .from("company_agent_skill_env")
        .upsert(
          {
            assignment_id: row.id,
            company_id: companyId,
            skill_slug: slug,
            agent_type: row.agent_type,
          },
          { onConflict: "assignment_id" }
        );
    }

    let installResult = null as Awaited<ReturnType<typeof installSkillOnCompanyContainer>> | null;
    if (installSpec) {
      const { data: company } = await admin
        .from("companies")
        .select("container_name")
        .eq("id", companyId)
        .single();
      installResult = await installSkillOnCompanyContainer({
        containerName: company?.container_name || null,
        installSpec,
      });
    }

    const sync = await syncSkillToAgents({
      admin,
      companyId,
      slug,
      content: skill.skill_md,
      agentTypes: targetAgents,
    });

    for (const agentType of targetAgents) {
      const syncFailure = sync.failed.find((f) => f.agentType === agentType);
      const isError = !installResult?.ok || Boolean(syncFailure);
      const installFailure = installResult?.ok === false;
      await admin
        .from("company_agent_skill_assignments")
        .update({
          install_status: isError ? "error" : "installed",
          install_message:
            syncFailure?.error ||
            installResult?.message ||
            "Skill installed",
          install_stdout: installResult?.stdout || null,
          install_stderr: installResult?.stderr || null,
          install_code: installResult?.code ?? null,
          install_warnings: installResult?.warnings || [],
          last_error: syncFailure?.error || (installResult?.ok === false ? installResult.message : null),
          installed_at: isError ? null : new Date().toISOString(),
          enabled: true,
        })
        .eq("company_id", companyId)
        .eq("skill_slug", slug)
        .eq("agent_type", agentType);

      if (isError) {
        try {
          const isSyncError = Boolean(syncFailure);
          await emitSkillIssueEvent(admin, {
            companyId,
            skillSlug: slug,
            skillName: skill.name || slug,
            agentType,
            issueCode: isSyncError ? "sync_error" : "install_error",
            summary: isSyncError
              ? `Skill sync failed for ${agentType} agent.`
              : `Dependency install failed for ${agentType} agent.`,
            details:
              syncFailure?.error ||
              installResult?.stderr ||
              installResult?.message ||
              (installFailure ? "Installer reported a failure." : "Skill update failed."),
            priority: "high",
          });
        } catch (eventErr: any) {
          console.warn("[Agent Skills] INSTALL event emit failed:", eventErr?.message || eventErr);
        }
      }
    }

    // Emit setup reminders for enabled assignments that are not eligible.
    try {
      const report = await buildCompanySkillStatusReport({ admin, companyId });
      const reportSkill = (report.skills || []).find((s: any) => s.slug === slug);
      const reportAssignments = (reportSkill?.assignments || []).filter((a: any) =>
        targetAgents.includes(a.agentType)
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
      console.warn("[Agent Skills] INSTALL setup event emit failed:", eventErr?.message || eventErr);
    }

    return NextResponse.json({
      success: true,
      slug,
      agentTypes: targetAgents,
      installer: installSpec
        ? {
            id: installSpec.id || null,
            kind: installSpec.kind,
            result: installResult,
          }
        : null,
      sync,
      note: "Skill changes apply best on a new chat session.",
    });
  } catch (err: any) {
    console.error("[Agent Skills] INSTALL error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to install skill" },
      { status: 500 }
    );
  }
}
