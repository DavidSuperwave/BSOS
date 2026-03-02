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
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const search = searchParams.get("search") || "";
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from("knowledge_documents")
      .select("id, title, content, created_at, updated_at, type, status", {
        count: "exact",
      })
      .eq("project_id", params.id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,content.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      documents: data,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    if (!body.title || !body.content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("knowledge_documents")
      .insert({
        project_id: params.id,
        title: body.title,
        content: body.content,
        type: body.type || "document",
        status: body.status || "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Store in Supermemory for semantic search
    if (process.env.SUPERMEMORY_API_KEY) {
      try {
        await fetch("https://api.supermemory.ai/v3/memories", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: `${body.title}\n\n${body.content}`,
            metadata: {
              source: "knowledge_base",
              project_id: params.id,
              document_id: data.id,
            },
          }),
        });
      } catch (memErr: any) {
        // Non-fatal — log but don't fail the request
        console.error("[Knowledge] Supermemory store error:", memErr.message);
      }
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const docIds = searchParams.get("ids")?.split(",") || [];

    if (docIds.length === 0) {
      return NextResponse.json(
        { error: "No document IDs provided" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("knowledge_documents")
      .delete()
      .eq("project_id", params.id)
      .in("id", docIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, deleted: docIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Bulk operations
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { operation, docIds, updates } = body;

    if (!operation || !docIds || docIds.length === 0) {
      return NextResponse.json(
        { error: "Operation and docIds are required" },
        { status: 400 }
      );
    }

    if (operation === "update_status") {
      const { error } = await supabase
        .from("knowledge_documents")
        .update({ status: updates.status, updated_at: new Date().toISOString() })
        .eq("project_id", params.id)
        .in("id", docIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, updated: docIds.length });
    }

    if (operation === "delete") {
      const { error } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("project_id", params.id)
        .in("id", docIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, deleted: docIds.length });
    }

    return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Search endpoint
export async function HEAD(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from("knowledge_documents")
      .select("*", { count: "exact", head: true })
      .eq("project_id", params.id);

    if (error) {
      return new NextResponse(null, { status: 400 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: { "X-Total-Count": String(count || 0) },
    });
  } catch (error: any) {
    return new NextResponse(null, { status: 500 });
  }
}

// Supermemory semantic search
export async function OPTIONS(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    if (!process.env.SUPERMEMORY_API_KEY) {
      // Fallback to Supabase text search
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, content, updated_at")
        .eq("project_id", params.id)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(10);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ results: data, source: "supabase" });
    }

    // Semantic search via Supermemory
    const response = await fetch(
      `https://api.supermemory.ai/v3/search?query=${encodeURIComponent(query)}&filter=project_id:${params.id}&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Supermemory search failed: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({ results: data.results || [], source: "supermemory" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
