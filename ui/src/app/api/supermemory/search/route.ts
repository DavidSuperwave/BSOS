import { NextRequest, NextResponse } from "next/server";
import { envConfig } from "@/lib/env";
import { searchInsights, companyContainerTag } from "@/lib/supermemory-client";
import type { InsightCategory } from "@/lib/supermemory-client";

export async function POST(req: NextRequest) {
  const apiKey = envConfig.supermemory.apiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Supermemory API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    const { query, companySlug, category, limit } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    const containerTag = companySlug
      ? companyContainerTag(companySlug)
      : "gtm_default";

    const results = await searchInsights(apiKey, containerTag, {
      query,
      category: category as InsightCategory | undefined,
      limit: limit || 10,
    });

    return NextResponse.json({ results, count: results.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Search failed" },
      { status: 500 }
    );
  }
}
