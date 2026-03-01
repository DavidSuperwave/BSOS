import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeSkillSlug } from "@/lib/skills/common";
import { createSkillShareLink } from "@/lib/skills/skill-sharing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 20, window: 60 });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const access = await requireCompanyAccess(companyId);
  if (access.error) return access.error;

  const skillSlug = normalizeSkillSlug(req.nextUrl.searchParams.get("slug") || "");

  try {
    const admin = getAdmin();
    let query = admin
      .from("skill_share_links")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (skillSlug) {
      query = query.eq("skill_slug", skillSlug);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      links: (data || []).map((row: any) => ({
        ...row,
        import_url: `/api/skills/share/${row.token}`,
      })),
    });
  } catch (err: any) {
    console.error("[Agent Skills] SHARE GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to list share links" },
      { status: 500 }
    );
  }
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
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: skill, error: skillErr } = await admin
      .from("company_skill_registry")
      .select("slug, name")
      .eq("company_id", companyId)
      .eq("slug", slug)
      .single();
    if (skillErr || !skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const link = await createSkillShareLink({
      admin,
      companyId,
      skillSlug: slug,
      createdBy: access.auth.userId,
      options: {
        label: body.label ? String(body.label) : undefined,
        expiresInHours:
          typeof body.expiresInHours === "number" ? body.expiresInHours : undefined,
        maxImports: typeof body.maxImports === "number" ? body.maxImports : undefined,
        allowDownload: body.allowDownload !== false,
        allowImport: body.allowImport !== false,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      skill: { slug: skill.slug, name: skill.name },
      link: {
        ...link,
        import_url: `/api/skills/share/${link.token}`,
      },
    });
  } catch (err: any) {
    console.error("[Agent Skills] SHARE POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create share link" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const access = await requireCompanyAccess(companyId);
  if (access.error) return access.error;

  try {
    const linkId = String(req.nextUrl.searchParams.get("id") || "");
    if (!linkId) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const { error } = await admin
      .from("skill_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", linkId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, id: linkId, revoked: true });
  } catch (err: any) {
    console.error("[Agent Skills] SHARE DELETE error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to revoke share link" },
      { status: 500 }
    );
  }
}
