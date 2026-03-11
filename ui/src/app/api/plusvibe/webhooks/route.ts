import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

function normalizeWebhookPayload(body: Record<string, any>) {
  const url = body?.url || body?.webhook_url || body?.hook_url;
  const campaignIds =
    (Array.isArray(body?.camp_ids) && body.camp_ids.length > 0 && body.camp_ids) ||
    (Array.isArray(body?.campaign_ids) && body.campaign_ids.length > 0 && body.campaign_ids) ||
    (typeof body?.campaign_id === "string" && body.campaign_id.trim() ? [body.campaign_id.trim()] : ["ALL"]);

  return {
    name: body?.name || "BSOS Inbox Webhook",
    url,
    camp_ids: campaignIds,
    event_types:
      (Array.isArray(body?.event_types) && body.event_types.length > 0 && body.event_types) ||
      ["ALL_EMAIL_REPLIES"],
    is_slack: typeof body?.is_slack === "number" ? body.is_slack : 0,
    secret: typeof body?.secret === "string" ? body.secret : "",
    ignore_ooo: typeof body?.ignore_ooo === "number" ? body.ignore_ooo : 0,
    ignore_automatic:
      typeof body?.ignore_automatic === "number" ? body.ignore_automatic : 0,
  };
}

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
    const payload = normalizeWebhookPayload(body);
    if (!payload.url) {
      return NextResponse.json(
        { error: "Webhook url is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const data = await plusvibeFetch("/hook/add", companyId, {
      method: "POST",
      body: payload,
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
    const payload = hookId
      ? { ...body, hook_ids: [hookId] }
      : body;
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
