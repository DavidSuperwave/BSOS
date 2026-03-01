import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAgentRequest } from "@/lib/agent-auth";
import { logInvocation } from "@/lib/tool-logger";
import { normalizeSkillSlug, sanitizeAgentType } from "@/lib/skills/common";
import { validateAndNormalizeSkill } from "@/lib/skills/skill-validator";
import {
  appendLearningProgress,
  buildDraftSkillFromLearningInput,
  markLearningSessionCompleted,
  markLearningSessionError,
  startSkillLearningSession,
} from "@/lib/skills/skill-learner";
import { syncSkillToAgents } from "@/lib/skills/skill-sync";
import { createSkillShareLink, importSharedSkillIntoCompany } from "@/lib/skills/skill-sharing";
import type { CompanyAgentType } from "@/lib/skills/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function parseAgentTypes(raw: unknown, fallback: CompanyAgentType): CompanyAgentType[] {
  if (!Array.isArray(raw) || raw.length === 0) return [fallback];
  const out: CompanyAgentType[] = [];
  for (const entry of raw) {
    const parsed = sanitizeAgentType(String(entry));
    if (parsed && !out.includes(parsed)) out.push(parsed);
  }
  return out.length > 0 ? out : [fallback];
}

async function resolveAgentType(admin: any, companyId: string, agentId: string): Promise<CompanyAgentType> {
  const { data } = await admin
    .from("company_agents")
    .select("agent_type")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const parsed = sanitizeAgentType(String(data?.agent_type || "main"));
  return parsed || "main";
}

async function assignAndSync(params: {
  admin: any;
  companyId: string;
  slug: string;
  content: string;
  agentTypes: CompanyAgentType[];
}) {
  await params.admin.from("company_agent_skill_assignments").upsert(
    params.agentTypes.map((agentType) => ({
      company_id: params.companyId,
      skill_slug: params.slug,
      agent_type: agentType,
      enabled: true,
      install_status: "pending",
      install_message: "Syncing skill files...",
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
        install_message: failure ? failure.error : "Skill synced",
        last_error: failure ? failure.error : null,
        installed_at: failure ? null : new Date().toISOString(),
      })
      .eq("company_id", params.companyId)
      .eq("skill_slug", params.slug)
      .eq("agent_type", agentType);
  }

  return sync;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getAdmin();
    const { data: skills, error } = await admin
      .from("company_skill_registry")
      .select("slug, name, description, version, updated_at")
      .eq("company_id", auth.companyId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/skills",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${skills?.length || 0} skills`,
    });

    return NextResponse.json({
      operations: [
        "create_skill",
        "learn_skill",
        "install_skill",
        "update_skill_env",
        "share_skill",
        "import_skill",
      ],
      skills: skills || [],
    });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/skills",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdmin();

  try {
    const body = await req.json();
    const operation = String(body.operation || body.tool || "").trim().toLowerCase();
    const params = body.params && typeof body.params === "object" ? body.params : {};

    if (!operation) {
      return NextResponse.json({ error: "operation is required" }, { status: 400 });
    }

    const agentType = await resolveAgentType(admin, auth.companyId, auth.agentId);
    let result: any = null;

    if (operation === "create_skill") {
      const validated = validateAndNormalizeSkill({
        skillMd: String(params.skillMd || params.content || ""),
        slug: params.slug,
        name: params.name,
        description: params.description,
        version: params.version,
        metadata: params.metadata,
      });
      if (!validated.ok) {
        return NextResponse.json(
          { error: "Skill validation failed", validation: validated },
          { status: 422 }
        );
      }

      const { data: skill, error } = await admin
        .from("company_skill_registry")
        .upsert(
          {
            company_id: auth.companyId,
            slug: validated.slug,
            name: validated.name,
            description: validated.description,
            version: validated.version,
            skill_md: validated.skillMd,
            metadata: validated.metadata,
          },
          { onConflict: "company_id,slug" }
        )
        .select("*")
        .single();
      if (error) throw error;
      result = { skill, validation: validated };
    } else if (operation === "learn_skill") {
      const sourceType = String(params.sourceType || params.source || "paste_docs").toLowerCase();
      const learnMode = String(params.mode || "quick").toLowerCase() === "interactive"
        ? "interactive"
        : "quick";
      const topic = String(params.topic || params.query || "").trim();
      const sourceUrl = String(params.url || params.sourceUrl || "").trim();
      const sourceContent = String(params.content || params.sourceContent || "").trim();

      const session = await startSkillLearningSession({
        admin,
        companyId: auth.companyId,
        sourceType: sourceType === "research" ? "research" : sourceType === "url" ? "url" : "paste_docs",
        learnMode,
        query: topic || undefined,
        sourceUrl: sourceUrl || undefined,
        sourceContent: sourceContent || undefined,
      });

      try {
        const draft = await buildDraftSkillFromLearningInput({
          sourceType: sourceType === "research" ? "research" : sourceType === "url" ? "url" : "paste_docs",
          mode: learnMode,
          topic,
          sourceUrl: sourceUrl || undefined,
          sourceContent: sourceContent || undefined,
        });
        for (const entry of draft.progress) {
          await appendLearningProgress({
            admin,
            sessionId: session.id,
            status: "drafting",
            entry,
          });
        }

        const validation = validateAndNormalizeSkill({
          skillMd: draft.skillMd,
          slug: params.slug,
          name: params.name || draft.name,
          description: params.description || draft.description,
          metadata: params.metadata,
          version: params.version,
        });

        if (!validation.ok) {
          await markLearningSessionError({
            admin,
            sessionId: session.id,
            message: validation.errors.join("; "),
          });
          return NextResponse.json(
            {
              error: "Validation failed",
              sessionId: session.id,
              validation,
            },
            { status: 422 }
          );
        }

        const { data: skill, error } = await admin
          .from("company_skill_registry")
          .upsert(
            {
              company_id: auth.companyId,
              slug: validation.slug,
              name: validation.name,
              description: validation.description,
              version: validation.version,
              skill_md: validation.skillMd,
              metadata: validation.metadata,
            },
            { onConflict: "company_id,slug" }
          )
          .select("*")
          .single();
        if (error) throw error;

        await markLearningSessionCompleted({
          admin,
          sessionId: session.id,
          skillSlug: validation.slug,
          draftSkillMd: validation.skillMd,
          draftMetadata: validation.metadata,
        });

        result = { sessionId: session.id, skill, validation };
      } catch (err: any) {
        await markLearningSessionError({
          admin,
          sessionId: session.id,
          message: err.message || "Skill learning failed",
        });
        throw err;
      }
    } else if (operation === "install_skill") {
      const slug = String(params.slug || "").trim();
      if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
      const safeSlug = normalizeSkillSlug(slug);
      const agentTypes = parseAgentTypes(params.agentTypes, agentType);
      const { data: skill, error } = await admin
        .from("company_skill_registry")
        .select("slug, skill_md")
        .eq("company_id", auth.companyId)
        .eq("slug", safeSlug)
        .single();
      if (error || !skill) {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 });
      }
      const sync = await assignAndSync({
        admin,
        companyId: auth.companyId,
        slug: safeSlug,
        content: skill.skill_md,
        agentTypes,
      });
      result = { slug: safeSlug, agentTypes, sync };
    } else if (operation === "update_skill_env") {
      const slug = normalizeSkillSlug(String(params.slug || ""));
      if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
      const targetAgentType = sanitizeAgentType(String(params.agentType || agentType)) || agentType;

      const { data: assignment } = await admin
        .from("company_agent_skill_assignments")
        .select("id")
        .eq("company_id", auth.companyId)
        .eq("skill_slug", slug)
        .eq("agent_type", targetAgentType)
        .maybeSingle();
      if (!assignment?.id) {
        return NextResponse.json({ error: "Skill is not assigned to this agent type" }, { status: 404 });
      }

      const { data: current } = await admin
        .from("company_agent_skill_env")
        .select("env")
        .eq("assignment_id", assignment.id)
        .maybeSingle();

      const mergedEnv = {
        ...((current?.env || {}) as Record<string, string>),
        ...((params.env || {}) as Record<string, string>),
      };

      const payload: Record<string, any> = {
        assignment_id: assignment.id,
        company_id: auth.companyId,
        skill_slug: slug,
        agent_type: targetAgentType,
        env: mergedEnv,
      };
      if (params.apiKey !== undefined) {
        payload.api_key = String(params.apiKey || "");
      }

      const { error } = await admin
        .from("company_agent_skill_env")
        .upsert(payload, { onConflict: "assignment_id" });
      if (error) throw error;

      result = { slug, agentType: targetAgentType, updated: true };
    } else if (operation === "share_skill") {
      const slug = normalizeSkillSlug(String(params.slug || ""));
      if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

      const link = await createSkillShareLink({
        admin,
        companyId: auth.companyId,
        skillSlug: slug,
        options: {
          expiresInHours:
            typeof params.expiresInHours === "number" ? params.expiresInHours : undefined,
          maxImports: typeof params.maxImports === "number" ? params.maxImports : undefined,
          allowImport: params.allowImport !== false,
          allowDownload: params.allowDownload !== false,
          label: params.label ? String(params.label) : undefined,
        },
      });

      result = {
        link,
        importUrl: `/api/skills/share/${link.token}`,
      };
    } else if (operation === "import_skill") {
      const token = String(params.token || "").trim();
      if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
      const importResult = await importSharedSkillIntoCompany({
        admin,
        targetCompanyId: auth.companyId,
        token,
        slugOverride: params.slug ? String(params.slug) : undefined,
        nameOverride: params.name ? String(params.name) : undefined,
        descriptionOverride: params.description ? String(params.description) : undefined,
        replaceExisting: Boolean(params.replaceExisting),
      });

      const shouldInstall = params.install !== false;
      if (shouldInstall) {
        const sync = await assignAndSync({
          admin,
          companyId: auth.companyId,
          slug: importResult.skill.slug,
          content: importResult.skill.skill_md,
          agentTypes: parseAgentTypes(params.agentTypes, agentType),
        });
        result = { ...importResult, sync };
      } else {
        result = importResult;
      }
    } else {
      return NextResponse.json({ error: `Unsupported operation: ${operation}` }, { status: 400 });
    }

    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/skills",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: operation,
    });

    return NextResponse.json({ success: true, operation, result });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/skills",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
