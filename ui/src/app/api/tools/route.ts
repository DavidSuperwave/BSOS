import { NextRequest, NextResponse } from 'next/server';
import { tools, getToolDescriptions } from '@/lib/agent-tools';
import { authenticateUser, requireCompanyAccess } from '@/lib/api-auth';
import { executeGatewayTool, getAllowedTools, type AgentType } from '@/lib/chat/tool-gateway';
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

// GET - List available tools
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentType = (searchParams.get("agentType") || "main") as AgentType;
  const allowed = getAllowedTools(agentType);
  return NextResponse.json({
    tools: tools
      .filter((t) => allowed.includes(t.name))
      .map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      })),
    descriptions: getToolDescriptions(),
    policies: {
      agentType,
      allowedTools: allowed,
    },
  });
}

// POST - Execute a tool
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const body = await request.json();
    const { tool, params, companyId, sessionKey, agentType = "main", sessionId } = body;

    if (!tool || !companyId || !sessionKey) {
      return NextResponse.json(
        { error: 'Missing required fields: tool, companyId, sessionKey' },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const admin = getAdmin();
    const { data: company } = await admin
      .from("companies")
      .select("slug")
      .eq("id", companyId)
      .single();

    console.log(`[Tools API] Executing: ${tool}`, params);

    const result = await executeGatewayTool(tool, params || {}, {
      companyId,
      companySlug: company?.slug || "default",
      sessionKey,
      sessionId,
      agentType: (String(agentType || "main").toLowerCase() as AgentType),
    });

    console.log(`[Tools API] Success: ${tool}`);

    return NextResponse.json({
      success: result.ok,
      result,
    });

  } catch (error: any) {
    console.error('[Tools API] Error:', error.message);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
