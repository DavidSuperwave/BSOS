import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/bsos/cron-runner";
import { runNoActiveCampaignSkillCheck } from "@/lib/skills/no-active-campaign-checker";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/cron/skills-no-active-campaign
 * Vercel Cron: Runs daily to detect companies with no active PlusVibe campaigns.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getAdmin();
    const { data: companies, error } = await admin
      .from("companies")
      .select("id, name")
      .eq("status", "active");

    if (error) throw new Error(error.message || "Failed to load companies");

    const results = [];
    for (const company of companies || []) {
      const result = await runNoActiveCampaignSkillCheck({
        admin,
        companyId: company.id,
      });
      results.push({
        companyId: company.id,
        companyName: company.name,
        status: result.status,
        summary: result.summary,
      });
    }

    return NextResponse.json({
      ran_at: new Date().toISOString(),
      companies_checked: results.length,
      issues_opened: results.filter((r) => r.status === "issue_open").length,
      resolved: results.filter((r) => r.status === "resolved").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (err: any) {
    console.error("[Cron] skills-no-active-campaign error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
