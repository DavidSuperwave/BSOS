import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/inbox/messages
 * Fetch inbox messages with filters
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const campaignId = searchParams.get("campaignId");
  const sentiment = searchParams.get("sentiment");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = (page - 1) * limit;

  const admin = getAdmin();
  try {
    let query = admin
      .from("inbox_messages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (companyId) query = query.eq("company_id", companyId);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (sentiment) query = query.eq("sentiment", sentiment);
    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (search) query = query.or(`subject.ilike.%${search}%,from_email.ilike.%${search}%,from_name.ilike.%${search}%`);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      messages: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/messages
 * Create/sync inbox message (used by webhook or manual sync)
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const {
      company_id,
      campaign_id,
      campaign_name,
      thread_id,
      plusvibe_id,
      from_email,
      from_name,
      to_email,
      subject,
      body: emailBody,
      body_text,
      sentiment,
      intent,
      tags,
      priority,
    } = body;

    if (!campaign_id || !from_email || !to_email || !subject || !emailBody) {
      return NextResponse.json(
        { error: "Missing required fields: campaign_id, from_email, to_email, subject, body" },
        { status: 400 }
      );
    }

    const from_domain = from_email.split("@")[1] || null;

    const { data, error } = await admin
      .from("inbox_messages")
      .insert({
        company_id,
        campaign_id,
        campaign_name,
        thread_id: thread_id || `thread_${from_email}_${campaign_id}`,
        plusvibe_id,
        from_email,
        from_name,
        from_domain,
        to_email,
        subject,
        body: emailBody,
        body_text: body_text || emailBody.replace(/<[^>]*>/g, ""),
        sentiment: sentiment || "neutral",
        intent,
        tags: tags || [],
        priority: priority || "medium",
      })
      .select()
      .single();

    if (error) throw error;

    // Update thread message count
    if (data.thread_id) {
      try {
        await admin
          .from("email_threads")
          .update({ message_count: data.reply_count + 1, last_activity: new Date().toISOString() })
          .eq("id", data.thread_id);
      } catch {
        // Thread may not exist yet, ignore
      }
    }

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create message" },
      { status: 500 }
    );
  }
}
