import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { companyContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

type SupermemoryRawDocument = {
  id?: string;
  content?: string | null;
  raw?: string | null;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  customId?: string | null;
  metadata?: Record<string, any> | null;
  containerTag?: string | null;
  containerTags?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  url?: string | null;
};

type CompanyRow = {
  slug: string;
  integration_credentials?: Record<string, any> | null;
};

function buildContainerTag(slug: string, requestedContainer?: string | null): string {
  const baseTag = companyContainerTag(slug);
  if (!requestedContainer || requestedContainer === "all") return baseTag;
  if (requestedContainer.startsWith("gtm_")) return requestedContainer;

  const suffix = requestedContainer
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return `${baseTag}_${suffix}`;
}

function normalizeDocument(
  raw: SupermemoryRawDocument,
  fallbackContainerTag: string
) {
  const metadata = raw.metadata ?? {};
  const containerTag =
    raw.containerTag ||
    (Array.isArray(raw.containerTags) && raw.containerTags.length > 0
      ? raw.containerTags[0]
      : fallbackContainerTag);

  return {
    id: raw.id ?? "",
    content: raw.content ?? raw.raw ?? "",
    raw: raw.raw ?? null,
    title: raw.title ?? metadata.title ?? null,
    type: raw.type ?? metadata.type ?? "document",
    status: raw.status ?? null,
    customId: raw.customId ?? null,
    metadata,
    containerTag,
    containerTags: raw.containerTags ?? (containerTag ? [containerTag] : []),
    createdAt: raw.createdAt ?? metadata.created_at ?? null,
    updatedAt: raw.updatedAt ?? null,
    url: raw.url ?? null,
  };
}

async function getCompanySupermemoryAuth(companyId: string) {
  const { data: company, error: companyError } = await getSupabase()
    .from("companies")
    .select("slug, integration_credentials")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return { error: NextResponse.json({ error: "Company not found" }, { status: 404 }) };
  }

  const row = company as CompanyRow;
  const smKey =
    row.integration_credentials?.supermemory_api_key || envConfig.supermemory.apiKey();

  if (!smKey) {
    return {
      error: NextResponse.json(
        { error: "Supermemory not configured for this company" },
        { status: 400 }
      ),
    };
  }

  return { smKey, slug: row.slug };
}

// GET /api/supermemory/documents?companyId=xxx&container=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get("companyId");
  const container = searchParams.get("container");
  const limitParam = Number(searchParams.get("limit") || 100);
  const offsetParam = Number(searchParams.get("offset") || 0);

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 100;
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

  if (!companyId) {
    return NextResponse.json(
      { error: "Company ID is required" },
      { status: 400 }
    );
  }

  try {
    const auth = await getCompanySupermemoryAuth(companyId);
    if (auth.error) {
      console.error("[Supermemory API] Auth error:", auth.error);
      return auth.error;
    }

    const containerTag = buildContainerTag(auth.slug, container);
    console.log(`[Supermemory API] Listing documents for container: ${containerTag}`);

    // Use search endpoint to filter by container
    const response = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: "*",
        containerTags: [containerTag],
        limit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Supermemory API] List error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: "Failed to fetch from Supermemory", details: errorText },
        { status: 502 }
      );
    }

    const data = await response.json();
    console.log(`[Supermemory API] List response:`, JSON.stringify(data).slice(0, 500));
    
    // Handle search results format: { results: [...] }
    const rawDocuments: SupermemoryRawDocument[] = Array.isArray(data?.results)
      ? data.results.map((r: any) => ({
          id: r.id,
          content: r.chunks?.[0]?.content || r.memory,
          raw: r.memory,
          title: r.metadata?.title,
          type: r.metadata?.type,
          metadata: r.metadata,
          containerTags: r.containerTags,
          createdAt: r.createdAt || r.metadata?.created_at,
          updatedAt: r.updatedAt,
        }))
      : Array.isArray(data?.documents)
      ? data.documents
      : Array.isArray(data)
      ? data
      : [];

    const documents = rawDocuments.map((doc) => normalizeDocument(doc, containerTag));
    const count = documents.length;

    return NextResponse.json({
      documents,
      containerTag,
      count,
    });
  } catch (err: any) {
    console.error("[Supermemory API] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST to create document in Supermemory
export async function POST(req: NextRequest) {
  try {
    const { companyId, content, containerTag, metadata, customId, entityContext } =
      await req.json();

    if (!companyId || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Company ID and content are required" },
        { status: 400 }
      );
    }

    const auth = await getCompanySupermemoryAuth(companyId);
    if (auth.error) return auth.error;

    const finalContainerTag = buildContainerTag(auth.slug, containerTag);
    console.log(`[Supermemory API] Creating document in container: ${finalContainerTag}`);
    
    const response = await fetch(`${SUPERMEMORY_BASE}/memories`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        containerTag: finalContainerTag,
        customId,
        entityContext,
        metadata: {
          ...metadata,
          title:
            metadata?.title ||
            content.split("\n")[0]?.replace(/^#+\s*/, "").trim() ||
            "Untitled",
          type: metadata?.type || "document",
          created_at: new Date().toISOString(),
          source: "gtm_engine_ui",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Supermemory API] POST error:", errorText);
      return NextResponse.json(
        { error: "Failed to create document" },
        { status: 502 }
      );
    }

    const result = await response.json();
    return NextResponse.json(
      {
        success: true,
        ...result,
        containerTag: finalContainerTag,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Supermemory API] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create document" },
      { status: 500 }
    );
  }
}
