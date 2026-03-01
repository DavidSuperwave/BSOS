export interface CloseDeal {
  close_id: string;
  status: "active" | "won" | "lost";
  value?: number;
  source: string;
  contact_name: string;
  contact_title?: string;
  created_at: Date;
  closed_at?: Date;
}

export interface ImportCloseConfig {
  apiKey: string;
  importRange: { from: Date; to: Date };
}

const CLOSE_BASE = "https://api.close.com/api/v1";

function safeText(value: unknown, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function safeNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function inferSource(row: any): string {
  const raw =
    safeText(row?.lead?.source) ||
    safeText(row?.source) ||
    safeText(row?.lead?.source_name) ||
    "unknown";
  const normalized = raw.toLowerCase();
  if (normalized.includes("outbound")) return "outbound";
  if (normalized.includes("inbound")) return "inbound";
  return raw;
}

function normalizeStatus(statusLabel: string): "active" | "won" | "lost" {
  const s = statusLabel.toLowerCase();
  if (s.includes("won") || s.includes("closed won")) return "won";
  if (s.includes("lost") || s.includes("closed lost")) return "lost";
  return "active";
}

export async function importCloseDeals(config: ImportCloseConfig): Promise<CloseDeal[]> {
  try {
    const rangeStart = config.importRange.from.toISOString();
    const rangeEnd = config.importRange.to.toISOString();
    const query = encodeURIComponent(`created >= "${rangeStart}" created <= "${rangeEnd}"`);
    const url = `${CLOSE_BASE}/opportunity/?_query=${query}&_limit=200`;

    const authHeader = Buffer.from(`${config.apiKey}:`).toString("base64");
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Close import failed (${response.status}): ${details.slice(0, 300)}`);
    }

    const payload = await response.json();
    const opportunities = (payload?.data || payload || []) as any[];

    return opportunities.map((row) => {
      const statusLabel = safeText(row?.status_label || row?.status || "active");
      const leadName =
        safeText(row?.lead?.display_name) ||
        safeText(row?.lead?.name) ||
        safeText(row?.contact_name) ||
        "Unknown Contact";

      const title =
        safeText(row?.lead?.title) ||
        safeText(row?.contact_title) ||
        undefined;

      const createdAt = new Date(row?.date_created || row?.created_at || Date.now());
      const closedRaw = row?.date_won || row?.date_lost || row?.closed_at;
      const closedAt = closedRaw ? new Date(closedRaw) : undefined;

      return {
        close_id: String(row?.id || ""),
        status: normalizeStatus(statusLabel),
        value: safeNumber(row?.value),
        source: inferSource(row),
        contact_name: leadName,
        contact_title: title,
        created_at: createdAt,
        closed_at: closedAt,
      };
    });
  } catch (error) {
    console.error("[Close Importer] import error:", error);
    throw error;
  }
}
