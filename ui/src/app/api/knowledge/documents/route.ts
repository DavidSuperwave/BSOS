import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";

// Supabase client with service role for knowledge base operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Type for knowledge documents
type KnowledgeDocument = {
  id: string;
  title: string;
  content: string;
  category?: string;
  company_id?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
};

// Lazy init Supabase client
let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");
  const companyId = searchParams.get("companyId");

  try {
    let query = getSupabase()
      .from('knowledge_documents' as any)
      .select('*')
      .order('updated_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }
    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data: documents, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (err: any) {
    console.error('[Knowledge API] GET error:', err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, content, category, companyId, metadata } = await req.json();

    const { data: document, error } = await getSupabase()
      .from('knowledge_documents' as any)
      .insert({
        title,
        content,
        category,
        company_id: companyId,
        metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Sync to Supermemory if configured
    const smKey = envConfig.supermemory.apiKey();
    if (smKey && companyId) {
      try {
        const { storeInsight, companyContainerTag } = await import("@/lib/supermemory-client");
        // Resolve company slug for containerTag
        const { data: comp } = await getSupabase()
          .from("companies")
          .select("slug")
          .eq("id", companyId)
          .single();
        const containerTag = companyContainerTag((comp as any)?.slug || "default");
        await storeInsight(smKey, containerTag, {
          content: `# ${title}\n\n${content}`,
          category: (category === "icp" ? "icp_refinement" : category === "campaign" ? "campaign_insight" : "general") as any,
          metadata: { source: "knowledge_base", document_title: title },
        });
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (err: any) {
    console.error('[Knowledge API] POST error:', err);
    return NextResponse.json(
      { error: err.message || "Failed to create document" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Document ID is required" },
      { status: 400 }
    );
  }

  try {
    const { error } = await getSupabase()
      .from('knowledge_documents' as any)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Knowledge API] DELETE error:', err);
    return NextResponse.json(
      { error: err.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}
