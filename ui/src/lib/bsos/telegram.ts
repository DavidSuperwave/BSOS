/**
 * BSOS Telegram Notification Client
 * Sends alerts and reports via Telegram Bot API.
 * Critical alerts route here — not email, not Slack.
 */

import { bsosConfig } from "./env-bsos";
import type { TelegramMessage, AlertItem } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Send a raw message via Telegram Bot API.
 */
export async function sendTelegramMessage(
  msg: TelegramMessage
): Promise<{ ok: boolean; error?: string }> {
  const botToken = bsosConfig.telegram.botToken();
  if (!botToken) {
    console.warn("[BSOS Telegram] Bot token not configured — skipping");
    return { ok: false, error: "Bot token not configured" };
  }

  const chatId = msg.chat_id || bsosConfig.telegram.chatId();
  if (!chatId) {
    console.warn("[BSOS Telegram] Chat ID not configured — skipping");
    return { ok: false, error: "Chat ID not configured" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg.text,
        parse_mode: msg.parse_mode || "HTML",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[BSOS Telegram] Send failed:", res.status, err);
      return { ok: false, error: `${res.status}: ${err}` };
    }

    return { ok: true };
  } catch (err: any) {
    console.error("[BSOS Telegram] Network error:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Format and send a critical alert via Telegram.
 */
export async function sendCriticalAlert(alert: AlertItem & { company_name?: string }) {
  const emoji = alert.type === "critical" ? "🚨" : alert.type === "warning" ? "⚠️" : "ℹ️";
  const lines = [
    `${emoji} <b>BSOS ${alert.type.toUpperCase()}</b>`,
    "",
    alert.message,
  ];

  if (alert.company_name) lines.push(`<b>Company:</b> ${alert.company_name}`);
  if (alert.campaign_id) lines.push(`<b>Campaign:</b> ${alert.campaign_id}`);
  if (alert.metric && alert.value !== undefined) {
    lines.push(`<b>${alert.metric}:</b> ${alert.value}${alert.threshold ? ` (threshold: ${alert.threshold})` : ""}`);
  }

  lines.push("", `<i>${new Date().toISOString()}</i>`);

  return sendTelegramMessage({
    chat_id: bsosConfig.telegram.chatId() || "",
    text: lines.join("\n"),
    parse_mode: "HTML",
  });
}

/**
 * Send a formatted EOD summary via Telegram.
 */
export async function sendEODSummary(summary: {
  company_name: string;
  total_sent: number;
  total_replied: number;
  total_bounced: number;
  reply_rate: string;
  bounce_rate: string;
  quality_score: number;
  alerts_count: number;
  report_date: string;
}) {
  const lines = [
    `📊 <b>BSOS EOD Report — ${summary.report_date}</b>`,
    `<b>${summary.company_name}</b>`,
    "",
    `📤 Sent: <b>${summary.total_sent}</b>`,
    `💬 Replied: <b>${summary.total_replied}</b> (${summary.reply_rate})`,
    `🔄 Bounced: <b>${summary.total_bounced}</b> (${summary.bounce_rate})`,
    `⭐ Reply Quality: <b>${summary.quality_score}/100</b>`,
  ];

  if (summary.alerts_count > 0) {
    lines.push(``, `⚠️ <b>${summary.alerts_count} alert(s)</b> — check dashboard`);
  }

  return sendTelegramMessage({
    chat_id: bsosConfig.telegram.chatId() || "",
    text: lines.join("\n"),
    parse_mode: "HTML",
  });
}

/**
 * Send health check failure alert.
 */
export async function sendHealthAlert(failures: string[]) {
  if (failures.length === 0) return { ok: true };

  const lines = [
    "🚨 <b>BSOS Health Check Failed</b>",
    "",
    ...failures.map((f) => `• ${f}`),
    "",
    `<i>${new Date().toISOString()}</i>`,
  ];

  return sendTelegramMessage({
    chat_id: bsosConfig.telegram.chatId() || "",
    text: lines.join("\n"),
    parse_mode: "HTML",
  });
}
