import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";
import { fetchCampaignDetail, fetchCampaignsWithStats } from "@/lib/plusvibe-campaigns";

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.title;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function GET(request: NextRequest) {
  // Get companyId from query params
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;

  try {
    const { campaigns } = await fetchCampaignsWithStats(companyId);
    return NextResponse.json({
      campaigns,
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
        error: err.message || "Failed to fetch campaigns",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  try {
    const body = await req.json();
    const campName = resolveCampaignName(body);
    if (!campName) {
      return NextResponse.json(
        { error: "Campaign name is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload = {
      ...body,
      camp_name: campName,
    };

    const data = await plusvibeFetch("/campaign/add/campaign", companyId, {
      method: "POST",
      body: payload,
    });

    const sourceCampaignId = firstString(body?.source_campaign_id);
    const createdCampaignId = firstString(data?._id, data?.id, data?.campaign_id);

    if (sourceCampaignId && createdCampaignId) {
      const { campaign: sourceCampaign } = await fetchCampaignDetail(companyId, sourceCampaignId);
      if (sourceCampaign) {
        const clonePayload: Record<string, any> = {
          campaign_id: createdCampaignId,
          camp_name: campName,
        };

        const cloneKeys = [
          "schedules",
          "sequences",
          "first_wait_time",
          "first_wait_time_unit",
          "email_accounts",
          "send_priority",
          "ignore_mailbox_limit",
          "template_id",
          "stop_on_lead_replied",
          "is_emailopened_tracking",
          "is_unsubscribed_link",
          "send_as_txt",
          "exclude_ooo",
          "ooo_nr_opt",
          "ooo_nr_ai_d",
          "ooo_nr_d",
          "is_acc_based_sending",
          "is_pause_on_bouncerate",
          "bounce_rate_limit",
          "send_risky_email",
          "unsub_blocklist",
          "other_email_acc",
          "is_esp_match",
        ];

        for (const key of cloneKeys) {
          if (sourceCampaign[key] !== undefined) clonePayload[key] = sourceCampaign[key];
        }

        if (!clonePayload.schedules && sourceCampaign.schedule) {
          clonePayload.schedules = sourceCampaign.schedule;
        }

        if (Object.keys(clonePayload).length > 2) {
          await plusvibeFetch("/campaign/update/campaign", companyId, {
            method: "PATCH",
            body: clonePayload,
          });
        }
      }
    }

    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        error: err.message || "Failed to create campaign",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}
