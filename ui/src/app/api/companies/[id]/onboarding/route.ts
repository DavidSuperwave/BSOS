import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

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

  const result = await requireCompanyAccess(id);
  if (result.error) return result.error;

  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("companies")
      .select("onboarding_data, onboarding_step, status")
      .eq("id", id)
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rl2 = limiter.check(rateLimitKey(req));
  if (!rl2.allowed) return rateLimitResponse(rl2.resetIn);

  const patchAuth = await requireCompanyAccess(id);
  if (patchAuth.error) return patchAuth.error;

  try {
    const body = await req.json();
    const admin = getAdmin();
    const { data: existingCompany } = await admin
      .from("companies")
      .select("integration_credentials, agent_config")
      .eq("id", id)
      .single();

    const updateData: Record<string, any> = {};
    if (body.onboarding_data !== undefined) updateData.onboarding_data = body.onboarding_data;
    if (body.onboarding_step !== undefined) updateData.onboarding_step = body.onboarding_step;
    if (body.agent_config !== undefined) {
      const existingAgentConfig =
        (existingCompany?.agent_config as Record<string, any> | null) || {};
      const nextAgentConfig =
        body.agent_config && typeof body.agent_config === "object"
          ? body.agent_config
          : {};
      updateData.agent_config = {
        ...existingAgentConfig,
        ...nextAgentConfig,
      };
    }
    if (body.integration_credentials !== undefined) {
      const existingIntegrationCredentials =
        (existingCompany?.integration_credentials as Record<string, any> | null) || {};
      const incomingIntegrationCredentials =
        body.integration_credentials && typeof body.integration_credentials === "object"
          ? body.integration_credentials
          : {};
      const mergedIntegrationCredentials = {
        ...existingIntegrationCredentials,
        ...incomingIntegrationCredentials,
      };

      updateData.integration_credentials = mergedIntegrationCredentials;

      // Keep legacy PlusVibe columns in sync while the app transitions fully to JSONB.
      if ("plusvibe_api_key" in mergedIntegrationCredentials) {
        updateData.plusvibe_api_key =
          mergedIntegrationCredentials.plusvibe_api_key || null;
        updateData.plusvibe_enabled = !!mergedIntegrationCredentials.plusvibe_api_key;
      }
      if ("plusvibe_workspace_id" in mergedIntegrationCredentials) {
        updateData.plusvibe_workspace_id =
          mergedIntegrationCredentials.plusvibe_workspace_id || null;
      }
    }

    // Also update company fields from onboarding data
    if (body.onboarding_data) {
      const od = body.onboarding_data;
      if (od.industry) updateData.industry = od.industry;
      if (od.domain) updateData.domain = od.domain;
      if (od.company_name) updateData.name = od.company_name;
    }

    const { data, error } = await admin
      .from("companies")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ company: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
