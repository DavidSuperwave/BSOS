import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { resolveSkillShareToken, markShareLinkUsed } from "@/lib/skills/skill-sharing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 60, window: 60 });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  try {
    const { token } = await params;
    const admin = getAdmin();
    const { link, skill } = await resolveSkillShareToken({
      admin,
      token,
    });

    const mode = (req.nextUrl.searchParams.get("mode") || "view").toLowerCase();
    await markShareLinkUsed({
      admin,
      linkId: link.id,
      incrementImportCount: false,
    });

    const base = {
      success: true,
      share: {
        token,
        id: link.id,
        label: link.label,
        companyId: link.company_id,
        skillSlug: link.skill_slug,
        expiresAt: link.expires_at,
        allowImport: Boolean(link.allow_import),
        allowDownload: Boolean(link.allow_download),
        maxImports: link.max_imports,
        importCount: link.import_count,
      },
      skill: {
        slug: skill.slug,
        name: skill.name,
        description: skill.description || "",
        version: skill.version || "1.0.0",
        metadata: skill.metadata || {},
      },
    };

    if (mode === "download") {
      if (!link.allow_download) {
        return NextResponse.json({ error: "Download disabled for this link" }, { status: 403 });
      }
      return NextResponse.json({
        ...base,
        package: {
          type: "skill-package",
          exportedAt: new Date().toISOString(),
          skill: {
            slug: skill.slug,
            name: skill.name,
            description: skill.description || "",
            version: skill.version || "1.0.0",
            skillMd: skill.skill_md,
            metadata: skill.metadata || {},
          },
        },
      });
    }

    return NextResponse.json(base);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Share token is invalid" },
      { status: 404 }
    );
  }
}
