import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runIntakePipeline, IntakePipelineConfig } from "@/lib/intake/intake-pipeline";
import { mapFormToContract } from "@/lib/intake";
import { OnboardingFormData } from "@/lib/intake/profile-builder";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { ensureProjectExists, seedCompanyProjects } from "@/lib/knowledge/project-seeder";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

async function ensureDefaultProject(admin: ReturnType<typeof createClient>, companyId: string, userId: string) {
  try {
    await seedCompanyProjects(companyId, admin, userId);
    return await ensureProjectExists("company-playbook", companyId, admin);
  } catch {
    const { data: existing } = await admin
      .from("knowledge_projects")
      .select("id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await admin
      .from("knowledge_projects")
      .insert({
        company_id: companyId,
        name: "General",
        slug: "default",
        description: "Default project for onboarding intake knowledge",
        type: "vault",
        container_tag_suffix: "default",
        created_by: userId,
        folder_structure: ["Profile", "ICP", "Campaigns", "Assets", "Analysis"],
      })
      .select("id")
      .single();

    if (error || !created?.id) {
      throw new Error(`Failed to ensure default project: ${error?.message || "unknown error"}`);
    }
    return created.id;
  }
}

const limiter = createRateLimiter({ limit: 5, window: 300 }); // 5 requests per 5 minutes

/**
 * POST /api/intake
 * Run the full company intake pipeline
 */
export async function POST(req: NextRequest) {
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  try {
    // Parse request body
    const body = await req.json();
    const { companyId, formData, integrations, options } = body;
    const normalizedFormData = mapFormToContract((formData || {}) as Record<string, any>);

    // Validate required fields
    if (!companyId || !formData) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, formData" },
        { status: 400 }
      );
    }

    // Check company access
    const authResult = await requireCompanyAccess(companyId);
    if (authResult.error) return authResult.error;

    const admin = getAdmin();
    const projectId = await ensureDefaultProject(admin, companyId, authResult.auth.userId);

    // Get company details
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, name, slug, integration_credentials")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const ic = (company.integration_credentials as Record<string, any>) || {};

    // Build pipeline config
    const pipelineConfig: IntakePipelineConfig = {
      companyId,
      companySlug: company.slug,
      projectId,
      userId: authResult.auth.userId,
      formData: normalizedFormData as OnboardingFormData,
      options: options || {},
    };

    // Add PlusVibe config if API key exists and not skipped
    if (!options?.skipPlusVibeImport && ic.plusvibe_api_key && ic.plusvibe_workspace_id) {
      pipelineConfig.plusvibeConfig = {
        apiKey: ic.plusvibe_api_key,
        workspaceId: ic.plusvibe_workspace_id,
        importRange: {
          from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
          to: new Date(),
        },
      };
    }

    // Add Close config if API key exists and not skipped
    if (!options?.skipCloseImport && ic.close_api_key) {
      pipelineConfig.closeConfig = {
        apiKey: ic.close_api_key,
        importRange: {
          from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
          to: new Date(),
        },
      };
    }

    // Run the intake pipeline
    console.log(`[API Intake] Starting intake pipeline for ${company.slug}`);
    const result = await runIntakePipeline(pipelineConfig);

    // Update company record with intake results
    if (result.success && result.profile) {
      await admin
        .from("companies")
        .update({
          onboarding_data: {
            ...normalizedFormData,
            intake_completed_at: new Date().toISOString(),
            intake_result: {
              success: result.success,
              stage: result.stage,
              summary: result.summary,
              documents_created: result.summary.totalDocumentsCreated,
            },
          },
          onboarding_step: "completed",
          status: "active",
          industry: normalizedFormData.industry,
          domain: normalizedFormData.website,
        })
        .eq("id", companyId);

      // Create activity log entry
      await admin.from("activities").insert({
        company_id: companyId,
        event_type: "intake_completed",
        title: "Company Intake Completed",
        description: `Intake pipeline completed with ${result.summary.totalDocumentsCreated} documents created in Supermemory`,
        priority: "medium",
        status: "unread",
        metadata: {
          campaigns_imported: result.summary.totalCampaignsImported,
          deals_imported: result.summary.totalDealsImported,
          documents_created: result.summary.totalDocumentsCreated,
          processing_time_ms: result.summary.processingTimeMs,
        },
      });
    }

    // Return result
    return NextResponse.json({
      success: result.success,
      stage: result.stage,
      summary: result.summary,
      stages: result.stages,
      errors: result.errors,
      warnings: result.warnings,
    });

  } catch (err: any) {
    console.error("[API Intake] Error:", err);
    return NextResponse.json(
      { error: err.message || "Intake pipeline failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/intake?companyId=xxx
 * Get intake status for a company
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  // Check company access
  const authResult = await requireCompanyAccess(companyId);
  if (authResult.error) return authResult.error;

  try {
    const admin = getAdmin();

    const { data: company, error } = await admin
      .from("companies")
      .select("id, name, slug, onboarding_data, onboarding_step, status, integration_credentials")
      .eq("id", companyId)
      .single();

    if (error || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const ic = (company.integration_credentials as Record<string, any>) || {};

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
        onboarding_step: company.onboarding_step,
      },
      onboarding_data: company.onboarding_data,
      available_integrations: {
        plusvibe: !!ic.plusvibe_api_key,
        close: !!ic.close_api_key,
        calendly: !!ic.calendly_api_key,
      },
    });

  } catch (err: any) {
    console.error("[API Intake] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch intake status" },
      { status: 500 }
    );
  }
}
