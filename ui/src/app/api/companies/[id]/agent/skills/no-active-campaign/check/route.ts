import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { runNoActiveCampaignSkillCheck } from "@/lib/skills/no-active-campaign-checker";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

async function runCheck(companyId: string) {
  const access = await requireCompanyAccess(companyId);
  if (access.error) return access.error;

  const admin = getAdmin();
  const result = await runNoActiveCampaignSkillCheck({ admin, companyId });
  return NextResponse.json(result);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  return runCheck(companyId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  return runCheck(companyId);
}
