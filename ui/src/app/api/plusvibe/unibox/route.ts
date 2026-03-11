import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;

  try {
    const pathParams = new URLSearchParams();
    const pageTrail = searchParams.get("page_trail");
    const limit = searchParams.get("limit");
    if (pageTrail) pathParams.set("page_trail", pageTrail);
    if (limit) pathParams.set("limit", limit);

    const path = pathParams.size > 0
      ? `/unibox/emails?${pathParams.toString()}`
      : "/unibox/emails";
    const data = await plusvibeFetch(path, companyId, { method: "GET" });
    const emails = Array.isArray(data)
      ? data
      : data?.emails || data?.data || data?.value || [];

    return NextResponse.json({
      emails: Array.isArray(emails) ? emails : [],
      page_trail: data?.page_trail || data?.next_page_trail || null,
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch unibox",
      },
      { status: 500 }
    );
  }
}
