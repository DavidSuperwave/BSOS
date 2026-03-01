import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import {
  appendLearningProgress,
  buildDraftSkillFromLearningInput,
  markLearningSessionCompleted,
  markLearningSessionError,
  startSkillLearningSession,
  type SkillLearnMode,
  type SkillLearnSourceType,
} from "@/lib/skills/skill-learner";
import { validateAndNormalizeSkill } from "@/lib/skills/skill-validator";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 12, window: 60 });

function normalizeSourceType(value: unknown): SkillLearnSourceType {
  const raw = String(value || "paste_docs").toLowerCase();
  if (raw === "research") return "research";
  if (raw === "url" || raw === "from_url") return "url";
  return "paste_docs";
}

function normalizeMode(value: unknown): SkillLearnMode {
  const raw = String(value || "quick").toLowerCase();
  return raw === "interactive" ? "interactive" : "quick";
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
    const action = String(body.action || "run").toLowerCase();

    if (action === "status") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      }
      const { data, error } = await admin
        .from("company_skill_learning_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("company_id", companyId)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Learning session not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, session: data });
    }

    if (action === "cancel") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      }
      const { error } = await admin
        .from("company_skill_learning_sessions")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("company_id", companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, sessionId, status: "cancelled" });
    }

    const sourceType = normalizeSourceType(body.sourceType || body.source || body.tab);
    const learnMode = normalizeMode(body.mode);
    const query = String(body.query || body.topic || "").trim();
    const sourceUrl = String(body.url || body.sourceUrl || "").trim();
    const sourceContent = String(body.content || body.sourceContent || "").trim();
    const shouldSave = body.save !== false;

    const session = await startSkillLearningSession({
      admin,
      companyId,
      createdBy: access.auth.userId,
      sourceType,
      learnMode,
      query: query || null || undefined,
      sourceUrl: sourceUrl || null || undefined,
      sourceContent: sourceContent || null || undefined,
    });

    await appendLearningProgress({
      admin,
      sessionId: session.id,
      status: "researching",
      entry: {
        ts: new Date().toISOString(),
        level: "info",
        message: `Learning started in ${learnMode} mode`,
      },
    });

    const drafted = await buildDraftSkillFromLearningInput({
      sourceType,
      mode: learnMode,
      topic: query || sourceUrl || "custom skill",
      sourceUrl: sourceUrl || undefined,
      sourceContent: sourceContent || undefined,
    });

    for (const entry of drafted.progress) {
      await appendLearningProgress({
        admin,
        sessionId: session.id,
        status: "drafting",
        entry,
      });
    }

    const validation = validateAndNormalizeSkill({
      skillMd: drafted.skillMd,
      slug: body.slug,
      name: body.name || drafted.name,
      description: body.description || drafted.description,
      metadata: body.metadata,
      version: body.version,
    });

    await appendLearningProgress({
      admin,
      sessionId: session.id,
      status: "validating",
      entry: {
        ts: new Date().toISOString(),
        level: validation.ok ? "info" : "error",
        message: validation.ok
          ? "Validation passed"
          : `Validation failed: ${validation.errors.join("; ")}`,
      },
    });

    if (!validation.ok || !shouldSave) {
      if (!validation.ok) {
        await markLearningSessionError({
          admin,
          sessionId: session.id,
          message: validation.errors.join("; "),
        });
      }

      return NextResponse.json(
        {
          success: validation.ok,
          sessionId: session.id,
          status: validation.ok ? "validated" : "error",
          draft: {
            slug: validation.slug,
            name: validation.name,
            description: validation.description,
            skillMd: validation.skillMd,
            metadata: validation.metadata,
          },
          validation: {
            ok: validation.ok,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        },
        { status: validation.ok ? 200 : 422 }
      );
    }

    const { data: skill, error: upsertErr } = await admin
      .from("company_skill_registry")
      .upsert(
        {
          company_id: companyId,
          slug: validation.slug,
          name: validation.name,
          description: validation.description,
          version: validation.version,
          skill_md: validation.skillMd,
          metadata: validation.metadata,
          created_by: access.auth.userId,
        },
        { onConflict: "company_id,slug" }
      )
      .select("*")
      .single();
    if (upsertErr) throw new Error(upsertErr.message);

    await markLearningSessionCompleted({
      admin,
      sessionId: session.id,
      skillSlug: validation.slug,
      draftSkillMd: validation.skillMd,
      draftMetadata: validation.metadata,
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      status: "completed",
      skill,
      validation: {
        ok: validation.ok,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    });
  } catch (err: any) {
    console.error("[Agent Skills] LEARN error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to learn skill" },
      { status: 500 }
    );
  }
}
