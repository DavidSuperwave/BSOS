import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/inbox/messages/:id
 * Get single message by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  try {
    const { data, error } = await admin
      .from("inbox_messages")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ message: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch message" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/inbox/messages/:id
 * Update message status, tags, priority, etc.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  try {
    const body = await req.json();
    const allowedFields = ["status", "priority", "tags", "sentiment", "intent", "ai_summary", "suggested_actions"];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("inbox_messages")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Sync tags to PlusVibe if tags were updated and message has a plusvibe reference
    if (updates.tags && data?.company_id && data?.plusvibe_lead_id) {
      try {
        const creds = await getProjectCredentials(data.company_id);
        if (creds) {
          await fetch(
            `https://server.plusvibe.com/api/v1/leads/${data.plusvibe_lead_id}/tags`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${creds.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ tags: updates.tags }),
              signal: AbortSignal.timeout(5000),
            }
          );
        }
      } catch (syncErr) {
        console.warn("[Inbox] PlusVibe tag sync failed (non-blocking):", syncErr);
      }
    }

    return NextResponse.json({ message: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update message" },
      { status: 500 }
    );
  }
}
