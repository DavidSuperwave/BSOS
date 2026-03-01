import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAgentRequest } from "@/lib/agent-auth";
import { logInvocation } from "@/lib/tool-logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getAdmin();

    // Get company's PlusVibe credentials
    const { data: company } = await admin
      .from("companies")
      .select("integration_credentials, plusvibe_api_key, plusvibe_workspace_id")
      .eq("id", auth.companyId)
      .single();

    const apiKey =
      company?.integration_credentials?.plusvibe_api_key ||
      company?.plusvibe_api_key ||
      process.env.PLUSVIBE_API_KEY;
    const workspaceId =
      company?.integration_credentials?.plusvibe_workspace_id ||
      company?.plusvibe_workspace_id ||
      process.env.PLUSVIBE_WORKSPACE_ID;

    if (!apiKey || !workspaceId) {
      return NextResponse.json(
        { error: "PlusVibe not configured for this company" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${workspaceId}`,
      {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      throw new Error(`PlusVibe API error: ${res.status}`);
    }

    const data = await res.json();
    const campaigns = Array.isArray(data)
      ? data
      : data.value || data.data || [];

    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/campaigns",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${campaigns.length} campaigns`,
    });

    return NextResponse.json({
      campaigns: campaigns.map((c: any) => ({
        id: c._id || c.id,
        name: c.name,
        status: c.status,
        created_at: c.created_at,
      })),
    });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/campaigns",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
