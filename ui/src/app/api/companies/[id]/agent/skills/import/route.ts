import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeSkillSlug, sanitizeAgentType } from "@/lib/skills/common";
import { importSharedSkillIntoCompany } from "@/lib/skills/skill-sharing";
import { importBlueprintToCompany } from "@/lib/skills/skill-catalog";
import { syncSkillToAgents } from "@/lib/skills/skill-sync";
import type { CompanyAgentType } from "@/lib/skills/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 20, window: 60 });

function parseAgentTypes(raw: unknown): CompanyAgentType[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: CompanyAgentType[] = [];
  for (const item of raw) {
    const value = sanitizeAgentType(String(item));
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

async function assignAndSyncSkill(params: {
  admin: any;
  companyId: string;
  slug: string;
  content: string;
  agentTypes: CompanyAgentType[];
}) {
  if (params.agentTypes.length === 0) {
    return { synced: [], failed: [] as Array<{ agentType: CompanyAgentType; error: string }> };
  }

  await params.admin.from("company_agent_skill_assignments").upsert(
    params.agentTypes.map((agentType) => ({
      company_id: params.companyId,
      skill_slug: params.slug,
      agent_type: agentType,
      enabled: true,
      install_status: "pending",
      install_message: "Importing and syncing skill...",
    })),
    { onConflict: "company_id,skill_slug,agent_type" }
  );

  const { data: assignmentRows } = await params.admin
    .from("company_agent_skill_assignments")
    .select("id, agent_type")
    .eq("company_id", params.companyId)
    .eq("skill_slug", params.slug)
    .in("agent_type", params.agentTypes);

  for (const row of assignmentRows || []) {
    await params.admin
      .from("company_agent_skill_env")
      .upsert(
        {
          assignment_id: row.id,
          company_id: params.companyId,
          skill_slug: params.slug,
          agent_type: row.agent_type,
        },
        { onConflict: "assignment_id" }
      );
  }

  const sync = await syncSkillToAgents({
    admin: params.admin,
    companyId: params.companyId,
    slug: params.slug,
    content: params.content,
    agentTypes: params.agentTypes,
  });

  for (const agentType of params.agentTypes) {
    const failure = sync.failed.find((entry) => entry.agentType === agentType);
    await params.admin
      .from("company_agent_skill_assignments")
      .update({
        install_status: failure ? "error" : "installed",
        install_message: failure ? failure.error : "Skill imported and synced",
        last_error: failure ? failure.error : null,
        installed_at: failure ? null : new Date().toISOString(),
        enabled: true,
      })
      .eq("company_id", params.companyId)
      .eq("skill_slug", params.slug)
      .eq("agent_type", agentType);
  }

  return sync;
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

  const admin = getAdmin();

  try {
    const body = await req.json();
    const type = String(body.type || body.sourceType || "share_link").toLowerCase();
    const assignAgentTypes = parseAgentTypes(body.agentTypes);
    const replaceExisting = Boolean(body.replaceExisting);
    const slugOverride = body.slug ? normalizeSkillSlug(String(body.slug)) : undefined;

    let importedSkill: any = null;
    let source: Record<string, any> = { type };

    if (type === "share_link") {
      const token = String(body.token || body.shareToken || "").trim();
      if (!token) {
        return NextResponse.json({ error: "token is required for share_link import" }, { status: 400 });
      }
      const result = await importSharedSkillIntoCompany({
        admin,
        targetCompanyId: companyId,
        token,
        importedBy: access.auth.userId,
        replaceExisting,
        slugOverride,
        nameOverride: body.name ? String(body.name) : undefined,
        descriptionOverride: body.description ? String(body.description) : undefined,
      });
      importedSkill = result.skill;
      source = {
        type,
        linkId: result.shareLink.id,
        sourceCompanyId: result.shareLink.company_id,
        sourceSkillSlug: result.shareLink.skill_slug,
      };
    } else if (type === "blueprint") {
      const blueprintId = String(body.blueprintId || "").trim();
      if (!blueprintId) {
        return NextResponse.json({ error: "blueprintId is required for blueprint import" }, { status: 400 });
      }
      importedSkill = await importBlueprintToCompany({
        admin,
        companyId,
        blueprintId,
        createdBy: access.auth.userId,
        slugOverride,
        replaceExisting,
      });
      source = { type, blueprintId };
    } else if (type === "company_copy") {
      const sourceCompanyId = String(body.sourceCompanyId || "").trim();
      const sourceSkillSlug = normalizeSkillSlug(String(body.sourceSkillSlug || ""));
      if (!sourceCompanyId || !sourceSkillSlug) {
        return NextResponse.json(
          { error: "sourceCompanyId and sourceSkillSlug are required for company_copy" },
          { status: 400 }
        );
      }

      const sourceAccess = await requireCompanyAccess(sourceCompanyId);
      if (sourceAccess.error) {
        return NextResponse.json({ error: "No access to source company" }, { status: 403 });
      }

      const { data: sourceSkill, error: sourceErr } = await admin
        .from("company_skill_registry")
        .select("*")
        .eq("company_id", sourceCompanyId)
        .eq("slug", sourceSkillSlug)
        .single();
      if (sourceErr || !sourceSkill) {
        return NextResponse.json({ error: "Source skill not found" }, { status: 404 });
      }

      const targetSlug = slugOverride || sourceSkill.slug;
      const { data: upserted, error: upsertErr } = await admin
        .from("company_skill_registry")
        .upsert(
          {
            company_id: companyId,
            slug: targetSlug,
            name: String(body.name || sourceSkill.name),
            description: String(body.description || sourceSkill.description || ""),
            version: sourceSkill.version || "1.0.0",
            skill_md: sourceSkill.skill_md,
            metadata: {
              ...(sourceSkill.metadata || {}),
              import: {
                source: "company_copy",
                source_company_id: sourceCompanyId,
                source_skill_slug: sourceSkill.slug,
                imported_at: new Date().toISOString(),
              },
            },
            created_by: access.auth.userId,
          },
          { onConflict: "company_id,slug" }
        )
        .select("*")
        .single();
      if (upsertErr) throw new Error(upsertErr.message);

      const { error: importErr } = await admin.from("company_skill_imports").insert({
        company_id: companyId,
        skill_slug: targetSlug,
        source_type: "company_copy",
        source_company_id: sourceCompanyId,
        source_skill_slug: sourceSkill.slug,
        imported_by: access.auth.userId,
      });
      if (importErr) throw new Error(importErr.message);

      importedSkill = upserted;
      source = { type, sourceCompanyId, sourceSkillSlug };
    } else {
      return NextResponse.json({ error: `Unsupported import type: ${type}` }, { status: 400 });
    }

    let sync: any = null;
    if (importedSkill && assignAgentTypes.length > 0) {
      sync = await assignAndSyncSkill({
        admin,
        companyId,
        slug: importedSkill.slug,
        content: importedSkill.skill_md,
        agentTypes: assignAgentTypes,
      });
    }

    return NextResponse.json({
      success: true,
      source,
      skill: importedSkill,
      assignedAgents: assignAgentTypes,
      sync,
    });
  } catch (err: any) {
    console.error("[Agent Skills] IMPORT error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to import skill" },
      { status: 500 }
    );
  }
}
