import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
  try {
    const data = await plusvibeFetch("/hook/list", companyId, { method: "GET" });
    const hooks = Array.isArray(data)
      ? data
      : data?.hooks || data?.data || data?.value || [];
    return NextResponse.json({ hooks: Array.isArray(hooks) ? hooks : [] });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to list webhooks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
  try {
    const body = await req.json();
    const data = await plusvibeFetch("/hook/add", companyId, {
      method: "POST",
      body,
    });
    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to create webhook" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
  try {
    const body = await req.json().catch(() => ({}));
    const hookId = req.nextUrl.searchParams.get("hook_id");
    const payload = hookId ? { ...body, hook_id: hookId } : body;
    const data = await plusvibeFetch("/hook/del", companyId, {
      method: "DELETE",
      body: payload,
    });
    return NextResponse.json(data ?? { success: true });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete webhook" },
      { status: 500 }
    );
  }
}
