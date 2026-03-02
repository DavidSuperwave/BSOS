import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lazy Supabase singleton — avoids crashing the build when env vars aren't set
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  _supabase = createClient(url, key);
  return _supabase;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", params.docId)
      .eq("project_id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const { data, error } = await supabase
      .from("knowledge_documents")
      .update({
        title: body.title,
        content: body.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.docId)
      .eq("project_id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("knowledge_documents")
      .delete()
      .eq("id", params.docId)
      .eq("project_id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
