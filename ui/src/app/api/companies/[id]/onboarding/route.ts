import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 30, window: 60 });

function resolvePublicBaseUrl(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = req.headers.get("host");
  if (host) {
    const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

async function ensurePlusVibeReplyWebhook(input: {
  apiKey: string;
  workspaceId: string;
  webhookUrl: string;
}) {
  const headers = {
    "x-api-key": input.apiKey,
    "Content-Type": "application/json",
  };

  try {
    const listRes = await fetch(
      `${PLUSVIBE_BASE}/webhooks?workspace_id=${encodeURIComponent(input.workspaceId)}`,
      {
        headers,
        signal: AbortSignal.timeout(10000),
      }
    );
    if (listRes.ok) {
      const listPayload = await listRes.json();
      const webhooks = Array.isArray(listPayload)
        ? listPayload
        : Array.isArray(listPayload?.value)
          ? listPayload.value
          : Array.isArray(listPayload?.data)
            ? listPayload.data
            : Array.isArray(listPayload?.webhooks)
              ? listPayload.webhooks
              : [];
      const existing = webhooks.find((webhook: any) => {
        const url = String(webhook?.url || webhook?.webhook_url || "").trim();
        const events = Array.isArray(webhook?.events) ? webhook.events.map((e: any) => String(e)) : [];
        return (
          url === input.webhookUrl &&
          (events.includes("ALL_EMAIL_REPLIES") || events.includes("FIRST_EMAIL_REPLIES"))
        );
      });
      if (existing) {
        return { success: true, reused: true };
      }
    }
  } catch {
    // Keep going and try create directly.
  }

  const createRes = await fetch(`${PLUSVIBE_BASE}/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      webhook_url: input.webhookUrl,
      url: input.webhookUrl,
      events: ["ALL_EMAIL_REPLIES"],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "Webhook setup failed");
    return { success: false, error: errText };
  }
  return { success: true, reused: false };
}

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

      const plusvibeApiKey = String(mergedIntegrationCredentials.plusvibe_api_key || "").trim();
      const plusvibeWorkspaceId = String(
        mergedIntegrationCredentials.plusvibe_workspace_id || ""
      ).trim();
      if (plusvibeApiKey && plusvibeWorkspaceId) {
        const webhookUrl = `${resolvePublicBaseUrl(req)}/api/webhooks/plusvibe`;
        const webhookResult = await ensurePlusVibeReplyWebhook({
          apiKey: plusvibeApiKey,
          workspaceId: plusvibeWorkspaceId,
          webhookUrl,
        });
        updateData.integration_credentials = {
          ...mergedIntegrationCredentials,
          plusvibe_webhook_url: webhookUrl,
          plusvibe_webhook_status: webhookResult.success
            ? webhookResult.reused
              ? "reused"
              : "created"
            : "failed",
          ...(webhookResult.success
            ? { plusvibe_webhook_error: null }
            : { plusvibe_webhook_error: webhookResult.error || "Webhook setup failed" }),
        };
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
