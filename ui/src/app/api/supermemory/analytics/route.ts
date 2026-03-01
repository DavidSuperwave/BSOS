import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { searchInsights, companyContainerTag } from "@/lib/supermemory-client";
import { envConfig } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const smKey = envConfig.supermemory.apiKey();
  if (!smKey) {
    return NextResponse.json({ error: "Supermemory not configured" }, { status: 400 });
  }

  try {
    const admin = getAdmin();

    // Get company slug for container tag
    const { data: company } = await admin
      .from("companies")
      .select("slug")
      .eq("id", companyId)
      .single();

    if (!company?.slug) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const containerTag = companyContainerTag(company.slug);

    // Search across all categories to enumerate documents
    const categories = [
      "company_profile",
      "campaign_insight",
      "icp_refinement",
      "research_summary",
      "reply_analysis",
      "user_preference",
      "tool_config",
      "general",
    ];

    const categoryResults = await Promise.all(
      categories.map(async (category) => {
        try {
          const results = await searchInsights(smKey, containerTag, {
            query: "*",
            category: category as any,
            limit: 50,
          });
          return { category, count: results.length, documents: results };
        } catch {
          return { category, count: 0, documents: [] };
        }
      })
    );

    // Build tag hierarchy
    const byTag: Record<string, { count: number; documents: any[] }> = {};
    let totalDocuments = 0;
    const allDocIds = new Set<string>();

    for (const cr of categoryResults) {
      if (cr.count > 0) {
        byTag[cr.category] = {
          count: cr.count,
          documents: cr.documents.map((d: any) => ({
            id: d.id,
            content: d.content?.slice(0, 200) || "",
            similarity: d.similarity,
            metadata: d.metadata,
          })),
        };
        for (const doc of cr.documents) {
          if (doc.id && !allDocIds.has(doc.id)) {
            allDocIds.add(doc.id);
            totalDocuments++;
          }
        }
      }
    }

    // Find potential duplicates (same content prefix in same category)
    const duplicates: string[] = [];
    for (const cr of categoryResults) {
      const contentPrefixes = new Map<string, number>();
      for (const doc of cr.documents) {
        const prefix = (doc.content || "").slice(0, 100);
        if (prefix) {
          const count = (contentPrefixes.get(prefix) || 0) + 1;
          contentPrefixes.set(prefix, count);
          if (count === 2) duplicates.push(`${cr.category}: "${prefix.slice(0, 50)}..."`);
        }
      }
    }

    // Health checks
    const health: { status: string; message: string }[] = [];

    if (totalDocuments === 0) {
      health.push({ status: "warning", message: "No documents in vault. Run intake pipeline to populate." });
    } else if (totalDocuments < 3) {
      health.push({ status: "warning", message: `Only ${totalDocuments} documents. Consider uploading more content.` });
    } else {
      health.push({ status: "healthy", message: `${totalDocuments} documents indexed.` });
    }

    if (!byTag.company_profile) {
      health.push({ status: "warning", message: "No company profile document found." });
    }

    if (!byTag.icp_refinement) {
      health.push({ status: "warning", message: "No ICP definition document found." });
    }

    if (duplicates.length > 0) {
      health.push({ status: "info", message: `${duplicates.length} potential duplicate${duplicates.length > 1 ? "s" : ""} detected.` });
    }

    return NextResponse.json({
      containerTag,
      totalDocuments,
      byTag,
      duplicates: duplicates.slice(0, 5),
      health,
    });
  } catch (err: any) {
    console.error("[Supermemory Analytics]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch storage analytics" },
      { status: 500 }
    );
  }
}
