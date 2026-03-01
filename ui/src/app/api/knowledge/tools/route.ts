import { NextRequest, NextResponse } from "next/server";
import { executeKnowledgeTool } from "@/lib/knowledge/knowledge-tools";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/knowledge/tools
 * 
 * RPC endpoint for agent knowledge base tools.
 * Agents call this to create, update, and search documents.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, params, companyId, sessionKey, agentType = "main" } = body;

    // Validate required fields
    if (!tool || !companyId || !sessionKey) {
      return NextResponse.json(
        { error: "Missing required fields: tool, companyId, sessionKey" },
        { status: 400 }
      );
    }

    // Get company slug for context
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("slug")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Build tool context
    const context = {
      companyId,
      companySlug: company.slug,
      sessionKey,
      agentType,
    };

    // Execute the tool
    const result = await executeKnowledgeTool(tool, params, context);

    // Return result
    if (result.success) {
      return NextResponse.json({
        success: true,
        tool,
        data: result.data,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          tool,
          error: result.error,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("[Knowledge Tools API] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/knowledge/tools
 * 
 * Returns tool definitions for agent configuration.
 */
export async function GET() {
  const { knowledgeToolDefinitions } = await import("@/lib/knowledge/knowledge-tools");
  
  return NextResponse.json({
    tools: knowledgeToolDefinitions,
    version: "1.0",
  });
}
