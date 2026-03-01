import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAgentRequest } from "@/lib/agent-auth";
import { logInvocation } from "@/lib/tool-logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/tools/data/inbox/messages/tag-batch
 *
 * Tags a set of inbox messages with an analysis_batch ID.
 * Used by the agent before analyzing replies so the compacted insight
 * can reference back to the exact messages that were processed.
 *
 * Body: { message_ids: string[], batch_id: string }
 *   OR: { filter: { campaign_id?, status?, since? }, batch_id: string }
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { batch_id } = body;

    if (!batch_id) {
      return NextResponse.json(
        { error: "batch_id is required" },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    let taggedCount = 0;

    if (body.message_ids && Array.isArray(body.message_ids)) {
      // Tag specific messages by ID
      const { data, error } = await admin
        .from("inbox_messages")
        .update({ analysis_batch: batch_id } as any)
        .eq("company_id", auth.companyId)
        .in("id", body.message_ids)
        .select("id");

      if (error) throw error;
      taggedCount = data?.length || 0;
    } else if (body.filter) {
      // Tag messages matching a filter
      let query = admin
        .from("inbox_messages")
        .update({ analysis_batch: batch_id } as any)
        .eq("company_id", auth.companyId)
        .is("analysis_batch", null); // Only tag unanalyzed messages

      if (body.filter.campaign_id) {
        query = query.eq("campaign_id", body.filter.campaign_id);
      }
      if (body.filter.status) {
        query = query.eq("status", body.filter.status);
      }
      if (body.filter.since) {
        query = query.gte("created_at", body.filter.since);
      }

      const { data, error } = await query.select("id");
      if (error) throw error;
      taggedCount = data?.length || 0;
    } else {
      return NextResponse.json(
        { error: "Provide message_ids array or filter object" },
        { status: 400 }
      );
    }

    logInvocation({
      companyId: auth.companyId,
      toolName: "tag_batch",
      toolTier: "proxied",
      inputParams: { batch_id, count: taggedCount },
      outputSummary: `Tagged ${taggedCount} messages`,
      status: "success",
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      success: true,
      batch_id,
      tagged_count: taggedCount,
    });
  } catch (err: any) {
    console.error("[Tag Batch] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to tag batch" },
      { status: 500 }
    );
  }
}
