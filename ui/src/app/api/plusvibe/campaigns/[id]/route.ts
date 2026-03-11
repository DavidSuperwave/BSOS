import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";
import { fetchCampaignDetail } from "@/lib/plusvibe-campaigns";

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.newName;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalizeStatusAction(input: string) {
  const value = String(input || "").toUpperCase().trim();
  if (["ACTIVE", "RUNNING", "LAUNCHED", "STARTED", "ON", "ENABLED"].includes(value)) {
    return "ACTIVE";
  }
  if (["PAUSED", "PAUSE", "INACTIVE", "STOPPED", "OFF", "DISABLED"].includes(value)) {
    return "PAUSED";
  }
  return null;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function toYesNo(value: unknown) {
  const bool = readBoolean(value);
  return bool === undefined ? undefined : bool ? "yes" : "no";
}

function sequenceVariationName(step: Record<string, any>, variation: Record<string, any>, index: number) {
  const explicit =
    variation?.name ||
    variation?.title ||
    variation?.label ||
    step?.title ||
    step?.name;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return `Variation ${String.fromCharCode(65 + index)}`;
}

function normalizeSequences(body: Record<string, any>) {
  if (!Array.isArray(body?.sequences) || body.sequences.length === 0) return undefined;

  return body.sequences.map((step: Record<string, any>, index: number) => {
    const rawVariations = Array.isArray(step?.variations) && step.variations.length > 0
      ? step.variations
      : [{
          subject: step?.subject || "",
          body: step?.body || "",
          name: step?.title || `Step ${index + 1}A`,
          label: "A",
        }];

    return {
      step: Number(step?.step ?? index + 1),
      wait_time: Number(step?.wait_time ?? step?.waitDays ?? step?.delay_days ?? 0),
      variations: rawVariations.map((variation: Record<string, any>, variationIndex: number) => ({
        variation:
          variation?.variation ||
          variation?.label ||
          String.fromCharCode(65 + variationIndex),
        name: sequenceVariationName(step, variation, variationIndex),
        subject: variation?.subject || "",
        body: variation?.body || "",
      })),
    };
  });
}

function normalizeDays(days: unknown) {
  const labelMap: Record<string, string> = {
    mon: "1",
    monday: "1",
    tue: "2",
    tues: "2",
    tuesday: "2",
    wed: "3",
    wednesday: "3",
    thu: "4",
    thur: "4",
    thurs: "4",
    thursday: "4",
    fri: "5",
    friday: "5",
    sat: "6",
    saturday: "6",
    sun: "7",
    sunday: "7",
  };

  if (Array.isArray(days)) {
    const mapped = days.reduce<Record<string, boolean>>((acc, day) => {
      const normalized = labelMap[String(day || "").trim().toLowerCase()];
      if (normalized) acc[normalized] = true;
      return acc;
    }, {});
    return Object.keys(mapped).length > 0 ? mapped : undefined;
  }

  if (days && typeof days === "object") {
    const mapped = Object.entries(days as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [key, value]) => {
      const normalized = labelMap[key.trim().toLowerCase()] || key;
      const bool = readBoolean(value);
      if (/^[1-7]$/.test(normalized) && bool !== undefined) {
        acc[normalized] = bool;
      }
      return acc;
    }, {});
    return Object.keys(mapped).length > 0 ? mapped : undefined;
  }

  return undefined;
}

function normalizeSchedules(body: Record<string, any>) {
  const source = (body?.schedules && typeof body.schedules === "object" ? body.schedules : null) ||
    (body?.schedule && typeof body.schedule === "object" ? body.schedule : null);

  const days = normalizeDays(source?.days ?? body?.days ?? body?.sendingDays);
  const timezone = source?.timezone || body?.timezone;
  const timingFrom = source?.timing?.from || source?.start_time || body?.startHour || body?.start_time;
  const timingTo = source?.timing?.to || source?.end_time || body?.endHour || body?.end_time;
  const dailyLimit = body?.daily_limit ?? source?.daily_limit;

  const hasScheduleData = Boolean(days || timezone || timingFrom || timingTo || dailyLimit !== undefined);
  if (!hasScheduleData) return undefined;

  return {
    ...(dailyLimit !== undefined ? { daily_limit: Number(dailyLimit) || 0 } : {}),
    ...(source?.daily_limit_new_lead !== undefined
      ? { daily_limit_new_lead: Number(source.daily_limit_new_lead) || 0 }
      : {}),
    ...(source?.start_date ? { start_date: source.start_date } : {}),
    ...(source?.end_date !== undefined ? { end_date: source.end_date || "" } : {}),
    ...(days ? { days } : {}),
    ...(timezone ? { timezone } : {}),
    ...((timingFrom || timingTo)
      ? {
          timing: {
            from: timingFrom || "09:00",
            to: timingTo || "17:00",
          },
        }
      : {}),
  };
}

function buildUpdatePayload(body: Record<string, any>, campaignId: string) {
  const payload: Record<string, any> = {
    campaign_id: campaignId,
  };

  const campName = resolveCampaignName(body);
  if (campName) payload.camp_name = campName;

  const passiveStatus = String(body?.status || "").toUpperCase().trim();
  if (passiveStatus && !normalizeStatusAction(passiveStatus)) {
    payload.status = passiveStatus;
  }

  const sequences = normalizeSequences(body);
  if (sequences) payload.sequences = sequences;

  const schedules = normalizeSchedules(body);
  if (schedules) payload.schedules = schedules;

  const stopOnReply = toYesNo(body?.stop_on_reply ?? body?.stop_on_lead_replied);
  if (stopOnReply) payload.stop_on_lead_replied = stopOnReply;

  const trackOpens = toYesNo(body?.tracking?.opens ?? body?.track_opens ?? body?.is_emailopened_tracking);
  if (trackOpens) payload.is_emailopened_tracking = trackOpens;

  const unsubscribeFooter = toYesNo(body?.unsubscribe_footer ?? body?.is_unsubscribed_link);
  if (unsubscribeFooter) payload.is_unsubscribed_link = unsubscribeFooter;

  const sendAsText = toYesNo(body?.send_as_txt);
  if (sendAsText) payload.send_as_txt = sendAsText;

  const excludeOoo = toYesNo(body?.exclude_ooo);
  if (excludeOoo) payload.exclude_ooo = excludeOoo;

  for (const key of [
    "email_accounts",
    "send_priority",
    "ignore_mailbox_limit",
    "template_id",
    "unlink_template",
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
    "first_wait_time",
    "first_wait_time_unit",
  ]) {
    if (body?.[key] !== undefined) payload[key] = body[key];
  }

  return payload;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;
  const { id } = await params;

  try {
    const { campaign } = await fetchCampaignDetail(companyId, id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json({ campaign });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  const { id } = await params;

  try {
    const body = await req.json();
    const action = normalizeStatusAction((body?.status ?? "").toString());

    if (body?.action === "add_subsequence") {
      return NextResponse.json(
        {
          error:
            "Subsequence creation requires a PlusVibe-compatible trigger and is not yet mapped from the current wizard trigger types.",
          code: "UNSUPPORTED_SUBSEQUENCE_TRIGGER",
        },
        { status: 400 }
      );
    }

    if (body?.action === "copy_subsequences") {
      return NextResponse.json(
        {
          error:
            "Copying subsequences is not supported by the current PlusVibe wrapper yet.",
          code: "UNSUPPORTED_ACTION",
        },
        { status: 400 }
      );
    }

    if (action === "ACTIVE") {
      const data = await plusvibeFetch("/campaign/launch", companyId, {
        method: "POST",
        body: { campaign_id: id },
      });
      return NextResponse.json(data);
    }

    if (action === "PAUSED") {
      const data = await plusvibeFetch("/campaign/pause", companyId, {
        method: "POST",
        body: { campaign_id: id },
      });
      return NextResponse.json(data);
    }

    if (body?.note !== undefined) {
      return NextResponse.json(
        {
          error: "Campaign note updates are not supported by the PlusVibe API wrapper.",
          code: "UNSUPPORTED_ACTION",
        },
        { status: 400 }
      );
    }

    const payload = buildUpdatePayload(body, id);
    if (Object.keys(payload).length <= 1) {
      return NextResponse.json(
        { error: "No supported campaign updates were provided", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const data = await plusvibeFetch("/campaign/update/campaign", companyId, {
      method: "PATCH",
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
      { error: err.message || "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const archiveCampaign = body?.archive_campaign;
    const saveLeadsToList = body?.save_leads_to_list;
    const payload = {
      campaign_id: id,
      is_archive: archiveCampaign === false ? "no" : "yes",
      is_save_lead_data: saveLeadsToList === true ? "yes" : "no",
    };

    await plusvibeFetch("/campaign/delete", companyId, {
      method: "DELETE",
      body: payload,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
