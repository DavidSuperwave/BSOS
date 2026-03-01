import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const closeWebhookSecret = process.env.CLOSE_WEBHOOK_SECRET;

const limiter = createRateLimiter({ limit: 60, window: 60 });

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function verifyCloseSignature(rawBody: string, signatureHeader: string) {
  if (!closeWebhookSecret) return true;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", closeWebhookSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const normalized = signatureHeader.replace(/^sha256=/, "");
  if (expected.length !== normalized.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
}

function getEventType(payload: any): string {
  return (
    payload?.event ||
    payload?.event_type ||
    payload?.meta?.event ||
    payload?.subscription?.event ||
    ""
  ).toString();
}

function isOpportunityCreatedEvent(type: string): boolean {
  const normalized = type.toLowerCase();
  return (
    normalized === "opportunity.created" ||
    normalized === "opportunity_created" ||
    normalized === "opportunity.new" ||
    normalized === "created.opportunity"
  );
}

function extractCompanyId(payload: any): string | null {
  return (
    payload?.company_id ||
    payload?.companyId ||
    payload?.meta?.companyId ||
    payload?.meta?.company_id ||
    payload?.data?.company_id ||
    null
  );
}

export async function POST(req: NextRequest) {
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-close-signature") || "";
    if (!verifyCloseSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = getEventType(payload);
    if (!isOpportunityCreatedEvent(eventType)) {
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }

    const admin = getAdmin();
    let companyId = extractCompanyId(payload);

    if (!companyId) {
      const { data: companies } = await admin
        .from("companies")
        .select("id")
        .limit(2);
      if (companies && companies.length === 1) {
        companyId = companies[0].id;
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { success: true, warning: "Company not resolved" },
        { status: 200 }
      );
    }

    const opportunity = payload?.data || payload?.opportunity || payload || {};
    const titleText =
      opportunity?.title || opportunity?.name || opportunity?.display_name || "New opportunity";
    const valueText = opportunity?.value ? `Value: ${opportunity.value}` : null;
    const stageText = opportunity?.status_label || opportunity?.status || null;

    const descriptionParts = [stageText ? `Stage: ${stageText}` : null, valueText].filter(Boolean);

    await admin.from("events").insert({
      company_id: companyId,
      event_type: "opportunity_created",
      title: `Opportunity created: ${titleText}`,
      description: descriptionParts.join(" • "),
      priority: "medium",
      actions: [
        {
          type: "navigate",
          label: "Open CRM",
          href: "/crm",
        },
      ],
      status: "unread",
    } as any);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("[Webhook Close] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
