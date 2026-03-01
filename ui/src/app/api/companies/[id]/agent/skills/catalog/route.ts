import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { listSkillCatalogForCompany } from "@/lib/skills/skill-catalog";

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
  const { id: companyId } = await params;
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const access = await requireCompanyAccess(companyId);
  if (access.error) return access.error;

  try {
    const admin = getAdmin();
    const catalog = await listSkillCatalogForCompany({ admin, companyId });
    return NextResponse.json({ success: true, companyId, catalog });
  } catch (err: any) {
    console.error("[Agent Skills] CATALOG error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load skills catalog" },
      { status: 500 }
    );
  }
}
