import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const admin = getAdmin();

  try {
    // Get recent skill executions
    const { data: executions } = await admin
      .from("skill_executions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get skill assignments and their status
    const { data: assignments } = await admin
      .from("company_agent_skill_assignments")
      .select("*")
      .eq("company_id", companyId);

    // Get recent agent tasks for issue detection
    const { data: recentTasks } = await admin
      .from("agent_tasks")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Detect issues
    const issues: { type: string; severity: string; message: string; action: string }[] = [];

    // Check for failed skill installations
    const failedInstalls = (assignments || []).filter(
      (a: any) => a.install_status === "error"
    );
    for (const failed of failedInstalls) {
      issues.push({
        type: "install_error",
        severity: "high",
        message: `Skill "${failed.skill_slug}" failed to install on ${failed.agent_type} agent`,
        action: `Reinstall skill ${failed.skill_slug}`,
      });
    }

    // Check for failed tasks
    const failedTasks = (recentTasks || []).filter(
      (t: any) => t.status === "failed"
    );
    if (failedTasks.length > 3) {
      issues.push({
        type: "task_failures",
        severity: "medium",
        message: `${failedTasks.length} agent tasks failed recently`,
        action: "Review failed tasks and retry",
      });
    }

    // Check for skills with no recent executions
    const activeSlugs = new Set(
      (executions || []).map((e: any) => e.skill_slug)
    );
    const installedSlugs = (assignments || [])
      .filter((a: any) => a.install_status === "installed" && a.enabled)
      .map((a: any) => a.skill_slug);
    const unusedSlugs = [...new Set(installedSlugs)].filter(
      (slug) => !activeSlugs.has(slug)
    );
    if (unusedSlugs.length > 0) {
      issues.push({
        type: "unused_skills",
        severity: "low",
        message: `${unusedSlugs.length} installed skill${unusedSlugs.length > 1 ? "s have" : " has"} not been executed recently`,
        action: "Review skill configuration",
      });
    }

    // Calculate execution stats
    const totalExecutions = (executions || []).length;
    const successfulExecutions = (executions || []).filter(
      (e: any) => e.status === "completed" || e.status === "success"
    ).length;
    const failedExecutions = (executions || []).filter(
      (e: any) => e.status === "failed" || e.status === "error"
    ).length;

    return NextResponse.json({
      issues,
      stats: {
        totalSkills: [...new Set(installedSlugs)].length,
        activeSkills: activeSlugs.size,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate: totalExecutions > 0
          ? Math.round((successfulExecutions / totalExecutions) * 100)
          : 100,
      },
      recentExecutions: (executions || []).slice(0, 10).map((e: any) => ({
        id: e.id,
        skillSlug: e.skill_slug,
        status: e.status,
        duration: e.duration_ms,
        createdAt: e.created_at,
      })),
    });
  } catch (err: any) {
    console.error("[Skills Health]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch skills health" },
      { status: 500 }
    );
  }
}
