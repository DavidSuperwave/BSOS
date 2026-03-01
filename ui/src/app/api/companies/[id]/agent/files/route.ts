import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setAgentFile, getAgentFile } from "@/lib/openclaw-client";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const ALLOWED_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
] as const;

const limiter = createRateLimiter({ limit: 30, window: 60 });

/**
 * GET /api/companies/[id]/agent/files?name=SOUL.md
 * Read a workspace file from the agent.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const fileName = req.nextUrl.searchParams.get("name");

  if (!fileName) {
    return NextResponse.json(
      { error: "name query parameter is required" },
      { status: 400 }
    );
  }

  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const result = await requireCompanyAccess(id);
  if (result.error) return result.error;

  try {
    const admin = getAdmin();
    const { data: company, error } = await admin
      .from("companies")
      .select("agent_config")
      .eq("id", id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const agentConfig = company.agent_config as Record<string, any> | null;
    if (!agentConfig?.agent_id) {
      return NextResponse.json(
        { error: "Agent not deployed" },
        { status: 400 }
      );
    }

    const file = await getAgentFile(agentConfig.agent_id, fileName);

    return NextResponse.json({
      name: fileName,
      content: typeof file === "string" ? file : file?.content || "",
      agent_id: agentConfig.agent_id,
    });
  } catch (err: any) {
    console.error("[Agent Files] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read file" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/companies/[id]/agent/files
 * Write/update a workspace file on the agent.
 *
 * Body: { name: string, content: string }
 */
export async function PUT(
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
    const body = await req.json();
    const { name, content } = body;

    if (!name || content === undefined) {
      return NextResponse.json(
        { error: "name and content are required" },
        { status: 400 }
      );
    }

    // Validate file name — only allow core workspace files and SKILL files
    const isCoreFile = ALLOWED_FILES.includes(name as any);
    const isSkillFile = /^SKILL_[A-Z0-9_]+\.md$/i.test(name);

    if (!isCoreFile && !isSkillFile) {
      return NextResponse.json(
        {
          error: `File '${name}' not allowed. Allowed: ${ALLOWED_FILES.join(", ")} or SKILL_*.md`,
        },
        { status: 400 }
      );
    }

    const { data: company, error } = await admin
      .from("companies")
      .select("agent_config")
      .eq("id", id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const agentConfig = company.agent_config as Record<string, any> | null;
    if (!agentConfig?.agent_id) {
      return NextResponse.json(
        { error: "Agent not deployed" },
        { status: 400 }
      );
    }

    // Write file to OpenClaw workspace via RPC
    await setAgentFile(agentConfig.agent_id, name, content);

    return NextResponse.json({
      success: true,
      name,
      agent_id: agentConfig.agent_id,
      bytes: new TextEncoder().encode(content).length,
    });
  } catch (err: any) {
    console.error("[Agent Files] PUT error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to write file" },
      { status: 500 }
    );
  }
}
