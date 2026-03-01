import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { companyContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

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

function normalizeDocument(raw: SupermemoryRawDocument, slug: string) {
  const metadata = raw.metadata ?? {};
  const fallbackContainer = companyContainerTag(slug);
  const containerTag =
    raw.containerTag ||
    (Array.isArray(raw.containerTags) && raw.containerTags.length > 0
      ? raw.containerTags[0]
      : fallbackContainer);

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

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const id = context.params.id;

  if (!companyId) {
    return NextResponse.json({ error: "Company ID is required" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
  }

  try {
    const auth = await getCompanySupermemoryAuth(companyId);
    if (auth.error) return auth.error;

    const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch document", details: errorText },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 }
      );
    }

    const raw = (await response.json()) as SupermemoryRawDocument;
    return NextResponse.json({ document: normalizeDocument(raw, auth.slug) });
  } catch (err: any) {
    console.error("[Supermemory API] Document GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch document" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const id = context.params.id;

  if (!companyId) {
    return NextResponse.json({ error: "Company ID is required" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
  }

  try {
    const auth = await getCompanySupermemoryAuth(companyId);
    if (auth.error) return auth.error;

    const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to delete document", details: errorText },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("[Supermemory API] Document DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const id = context.params.id;

  if (!companyId) {
    return NextResponse.json({ error: "Company ID is required" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
  }

  try {
    const payload = await req.json();
    const auth = await getCompanySupermemoryAuth(companyId);
    if (auth.error) return auth.error;

    const nextBody: Record<string, any> = {};

    if (typeof payload?.content === "string") {
      nextBody.content = payload.content;
    }
    if (typeof payload?.customId === "string" && payload.customId.trim()) {
      nextBody.customId = payload.customId.trim();
    }
    if (typeof payload?.containerTag === "string" && payload.containerTag.trim()) {
      nextBody.containerTag = payload.containerTag.trim();
    }

    const metadata: Record<string, any> =
      payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    if (typeof payload?.title === "string") {
      metadata.title = payload.title;
    }
    metadata.updated_at = new Date().toISOString();
    metadata.source = metadata.source || "gtm_engine_ui";

    if (Object.keys(metadata).length > 0) {
      nextBody.metadata = metadata;
    }

    if (Object.keys(nextBody).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nextBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to update document", details: errorText },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 }
      );
    }

    const patchResult = await response.json();

    // Return normalized document to keep client state coherent after save.
    const getResponse = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!getResponse.ok) {
      return NextResponse.json({ success: true, ...patchResult });
    }

    const raw = (await getResponse.json()) as SupermemoryRawDocument;
    return NextResponse.json({
      success: true,
      ...patchResult,
      document: normalizeDocument(raw, auth.slug),
    });
  } catch (err: any) {
    console.error("[Supermemory API] Document PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update document" },
      { status: 500 }
    );
  }
}
