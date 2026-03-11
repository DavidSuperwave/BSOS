import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { provisionAgent } from "@/lib/agent-provisioning";
import { envConfig } from "@/lib/env";
import {
  createAgent,
  setAgentFile,
} from "@/lib/openclaw-client";
import {
  seedCompanyProfile,
  storeInsight,
} from "@/lib/supermemory-client";
import { ensureCompanySupermemoryKey } from "@/lib/supermemory-key-pool";
import { applyDefaultSkillPackToCompany } from "@/lib/skills/skill-catalog";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { runIntakePipeline, mapFormToContract } from "@/lib/intake";
import { hydratePlusVibeInboxAndWebhook } from "@/lib/plusvibe-inbox-sync";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CALENDLY_BASE = "https://api.calendly.com";

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 5, window: 60 });

async function resolveCalendlyUserUri(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${CALENDLY_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.resource?.uri || data?.resource?.owner || null;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const result = await requireCompanyAccess(id);
  if (result.error) return result.error;

  try {
    const admin = getAdmin();
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, any> = {};

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const rawOnboarding = form.get("onboarding_data");
      if (typeof rawOnboarding === "string" && rawOnboarding.trim()) {
        try {
          body.onboarding_data = JSON.parse(rawOnboarding);
        } catch {
          body.onboarding_data = {};
        }
      } else {
        body.onboarding_data = {};
      }

      body.uploaded_files = form
        .getAll("uploaded_files")
        .filter((value): value is File => value instanceof File);
      body.uploaded_file_count = Number(form.get("uploaded_file_count") || 0);
    } else {
      body = await req.json();
    }

    // Get company data
    const { data: company, error: fetchError } = await admin
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Use provided onboarding_data or existing
    const onboardingData = mapFormToContract(
      body.onboarding_data || company.onboarding_data || {}
    );

    // Provision agent (generates workspace files + config)
    const agent = provisionAgent({
      id: company.id,
      name: company.name,
      slug: company.slug,
      onboarding_data: onboardingData,
    });

    // Build integration credentials from onboarding data + existing company values.
    const integrationCredentials: Record<string, any> = {
      ...((company.integration_credentials as Record<string, any> | null) || {}),
    };
    if (onboardingData.plusvibe_api_key) {
      integrationCredentials.plusvibe_api_key =
        onboardingData.plusvibe_api_key;
      integrationCredentials.plusvibe_workspace_id =
        onboardingData.plusvibe_workspace_id;
    }
    if (onboardingData.calendly_api_key) {
      integrationCredentials.calendly_api_key =
        onboardingData.calendly_api_key;
      const calendlyUserUri =
        onboardingData.calendly_user_uri ||
        (await resolveCalendlyUserUri(onboardingData.calendly_api_key));
      if (calendlyUserUri) {
        integrationCredentials.calendly_user_uri = calendlyUserUri;
      }
    }
    if (onboardingData.close_api_key) {
      integrationCredentials.close_api_key = onboardingData.close_api_key;
    }
    // BUG 5 FIX: Extract Telegram credentials into integration_credentials.
    // The form stores these as `telegram_token` and `telegram_chat_id` in
    // onboarding_data. The provision route needs them in integration_credentials.
    if (onboardingData.telegram_token) {
      integrationCredentials.telegram_token = onboardingData.telegram_token;
    }
    if (onboardingData.telegram_chat_id) {
      integrationCredentials.telegram_chat_id = onboardingData.telegram_chat_id;
    }
    if (onboardingData.supermemory_api_key) {
      integrationCredentials.supermemory_api_key = onboardingData.supermemory_api_key;
    }

    // Auto-assign a Supermemory key from admin key pool when company has none.
    if (!integrationCredentials.supermemory_api_key) {
      const assignedKey = await ensureCompanySupermemoryKey(admin, id);
      if (assignedKey) {
        integrationCredentials.supermemory_api_key = assignedKey;
      }
    }

    // Update company record in Supabase
    const { error: updateError } = await admin
      .from("companies")
      .update({
        status: "active",
        agent_status: "provisioning",
        agent_config: {
          agent_id: agent.agentId,
          token: agent.token,
          container_tag: agent.containerTag,
          model: agent.agentConfig.model,
          compaction_strategy: "breadcrumb",
        },
        integration_credentials: integrationCredentials,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_data: onboardingData,
        plusvibe_api_key: onboardingData.plusvibe_api_key || null,
        plusvibe_workspace_id: onboardingData.plusvibe_workspace_id || null,
        plusvibe_enabled: !!onboardingData.plusvibe_api_key,
        industry: onboardingData.industry || company.industry,
        icp: JSON.stringify({
          titles: onboardingData.icp_titles,
          company_size: onboardingData.icp_company_size,
          verticals: onboardingData.icp_verticals,
          geo: onboardingData.icp_geo,
        }),
        pain_points: onboardingData.pain_points || [],
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Create agent in OpenClaw via RPC
    let openclawCreated = false;
    try {
      await createAgent({
        name: agent.agentId,
        model: agent.agentConfig.model,
      });

      // Write workspace files
      await Promise.all([
        setAgentFile(agent.agentId, "AGENTS.md", agent.workspace.agentsMd),
        setAgentFile(agent.agentId, "SOUL.md", agent.workspace.soulMd),
        setAgentFile(agent.agentId, "TOOLS.md", agent.workspace.toolsMd),
      ]);

      openclawCreated = true;
    } catch (err) {
      console.warn(
        "[Deploy Agent] OpenClaw RPC unavailable, workspace files stored in config only:",
        err
      );
    }

    // Seed Supermemory with company profile + ICP using company key first.
    const smKey =
      integrationCredentials.supermemory_api_key || envConfig.supermemory.apiKey();
    if (smKey) {
      const containerTag = agent.containerTag;

      // Seed company profile
      await seedCompanyProfile(
        smKey,
        containerTag,
        agent.workspace.agentsMd,
        company.id
      );

      // Seed ICP as separate insight for better recall
      if (onboardingData.icp_titles || onboardingData.icp_verticals) {
        await storeInsight(smKey, containerTag, {
          content: `ICP Definition for ${company.name}:
Titles: ${(onboardingData.icp_titles || []).join(", ")}
Company size: ${onboardingData.icp_company_size || "N/A"}
Verticals: ${(onboardingData.icp_verticals || []).join(", ")}
Geography: ${(onboardingData.icp_geo || []).join(", ")}
Pain points: ${(onboardingData.pain_points || []).join(", ")}`,
          category: "icp_refinement",
          customId: `icp_baseline_${company.id}`,
          metadata: {
            company_id: company.id,
            source: "onboarding",
            version: 1,
          },
        });
      }
    }

    // Mark as active
    await admin
      .from("companies")
      .update({ agent_status: "active" })
      .eq("id", id);

    // Ensure baseline default skills are present and synced to main agent.
    try {
      await applyDefaultSkillPackToCompany({
        admin,
        companyId: id,
        createdBy: result.auth.userId,
        agentTypes: ["main", "campaigns", "crm", "inbox"],
      });
    } catch (skillErr: any) {
      console.warn("[Deploy Agent] Default skill pack apply skipped:", skillErr?.message || skillErr);
    }

    // Run full intake pipeline (non-blocking — errors degrade gracefully)
    let intakeResult = null;
    try {
      const plusvibeConfig = onboardingData.plusvibe_api_key
        ? {
            apiKey: onboardingData.plusvibe_api_key,
            workspaceId: onboardingData.plusvibe_workspace_id || "",
            importRange: {
              from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
              to: new Date(),
            },
          }
        : undefined;

      const closeConfig = onboardingData.close_api_key
        ? {
            apiKey: onboardingData.close_api_key,
            importRange: {
              from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
              to: new Date(),
            },
          }
        : undefined;

      intakeResult = await runIntakePipeline({
        companyId: id,
        companySlug: company.slug,
        projectId: id,
        userId: result.auth.userId,
        formData: onboardingData,
        plusvibeConfig,
        closeConfig,
        uploadedFiles: body.uploaded_files || undefined,
      });

      console.debug(
        `[Deploy Agent] Intake pipeline: ${intakeResult.stage}, ` +
        `docs=${intakeResult.summary.totalDocumentsCreated}, ` +
        `campaigns=${intakeResult.summary.totalCampaignsImported}, ` +
        `deals=${intakeResult.summary.totalDealsImported}`
      );
    } catch (intakeErr: any) {
      console.warn("[Deploy Agent] Intake pipeline failed (non-blocking):", intakeErr?.message || intakeErr);
    }

    let inboxSetup: Record<string, any> | null = null;
    if (
      integrationCredentials.plusvibe_api_key &&
      integrationCredentials.plusvibe_workspace_id
    ) {
      try {
        inboxSetup = await hydratePlusVibeInboxAndWebhook(id);
      } catch (syncErr: any) {
        inboxSetup = {
          error: syncErr?.message || "Inbox setup failed",
          webhookRegistered: false,
          hydratedCount: 0,
          pagesFetched: 0,
        };
      }
    }

    return NextResponse.json({
      success: true,
      agent_id: agent.agentId,
      container_tag: agent.containerTag,
      openclaw_registered: openclawCreated,
      status: "active",
      intake: intakeResult
        ? {
            stage: intakeResult.stage,
            documentsCreated: intakeResult.summary.totalDocumentsCreated,
            campaignsImported: intakeResult.summary.totalCampaignsImported,
            dealsImported: intakeResult.summary.totalDealsImported,
          }
        : null,
      inbox_setup: inboxSetup,
    });
  } catch (err: any) {
    console.error("[Deploy Agent] Error:", err);

    // Mark as error
    const admin = getAdmin();
    await admin
      .from("companies")
      .update({ agent_status: "error" })
      .eq("id", id);

    return NextResponse.json(
      { error: err.message || "Failed to deploy agent" },
      { status: 500 }
    );
  }
}
