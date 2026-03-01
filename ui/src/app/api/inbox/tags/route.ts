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
 * GET /api/inbox/tags
 * List all tags for a company
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const admin = getAdmin();

  try {
    let query = admin
      .from("email_tags")
      .select("*")
      .order("name", { ascending: true });

    if (companyId) query = query.eq("company_id", companyId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ tags: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/tags
 * Create or update a tag
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const { company_id, name, color, category, rules } = body;

    if (!name) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("email_tags")
      .upsert(
        {
          company_id,
          name,
          color: color || "#6b7280",
          category: category || "custom",
          rules,
        },
        { onConflict: "company_id,name" }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create tag" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/inbox/tags
 * Delete a tag by ID (pass ?id=...)
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Tag ID required" }, { status: 400 });
  }

  try {
    const admin = getAdmin();
    const { error } = await admin.from("email_tags").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete tag" },
      { status: 500 }
    );
  }
}
