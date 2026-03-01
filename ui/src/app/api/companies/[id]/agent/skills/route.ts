import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeSkillSlug } from "@/lib/skills/common";
import { parseSkillFrontmatter } from "@/lib/skills/frontmatter";
import { buildCompanySkillStatusReport } from "@/lib/skills/skill-status";
import { removeSkillFromAgents } from "@/lib/skills/skill-sync";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 30, window: 60 });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const authResult = await requireCompanyAccess(id);
  if (authResult.error) return authResult.error;

  try {
    const admin = getAdmin();
    const report = await buildCompanySkillStatusReport({ admin, companyId: id });
    return NextResponse.json(report);
  } catch (err: any) {
    console.error("[Agent Skills] GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to get skills status" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const authResult = await requireCompanyAccess(id);
  if (authResult.error) return authResult.error;

  try {
    const body = await req.json();
    const admin = getAdmin();

    const skillMd = String(body.skillMd || body.content || "").trim();
    if (!skillMd) {
      return NextResponse.json(
        { error: "skillMd is required" },
        { status: 400 }
      );
    }

    const parsed = parseSkillFrontmatter(skillMd);
    const slug = normalizeSkillSlug(String(body.slug || parsed.name || ""));
    if (!slug) {
      return NextResponse.json(
        { error: "slug is required (or include `name` in SKILL frontmatter)" },
        { status: 400 }
      );
    }

    const name = String(body.name || parsed.name || slug).trim();
    const description = String(body.description || parsed.description || "").trim();
    const version = String(body.version || "1.0.0").trim();
    const metadata =
      body.metadata && typeof body.metadata === "object"
        ? body.metadata
        : { openclaw: parsed.metadata || {} };

    const { data, error } = await admin
      .from("company_skill_registry")
      .upsert(
        {
          company_id: id,
          slug,
          name,
          description,
          version,
          skill_md: skillMd,
          metadata,
          created_by: authResult.auth.userId,
        },
        { onConflict: "company_id,slug" }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, skill: data }, { status: 201 });
  } catch (err: any) {
    console.error("[Agent Skills] POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upsert skill" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slugRaw = req.nextUrl.searchParams.get("slug") || "";
  const slug = normalizeSkillSlug(slugRaw);

  if (!slug) {
    return NextResponse.json(
      { error: "slug query parameter is required" },
      { status: 400 }
    );
  }

  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const authResult = await requireCompanyAccess(id);
  if (authResult.error) return authResult.error;

  try {
    const admin = getAdmin();
    const { data: assigned } = await admin
      .from("company_agent_skill_assignments")
      .select("agent_type")
      .eq("company_id", id)
      .eq("skill_slug", slug);

    const agentTypes = Array.from(
      new Set((assigned || []).map((r: any) => r.agent_type))
    ) as Array<"main" | "campaigns" | "crm" | "inbox">;

    const unsyncResult =
      agentTypes.length > 0
        ? await removeSkillFromAgents({
            admin,
            companyId: id,
            slug,
            agentTypes,
          })
        : { removed: [], failed: [] };

    const { error } = await admin
      .from("company_skill_registry")
      .delete()
      .eq("company_id", id)
      .eq("slug", slug);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      slug,
      removed_from_agents: unsyncResult.removed.map((x) => x.agentType),
      remove_errors: unsyncResult.failed,
    });
  } catch (err: any) {
    console.error("[Agent Skills] DELETE error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to delete skill" },
      { status: 500 }
    );
  }
}
