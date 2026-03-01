/**
 * Inboxing API v2 Client
 * Base URL: https://v2.inboxing.com/api/v2
 * Auth: X-API-Key header
 * Rate Limit: 120 req/min
 */

import { envConfig } from "./env";

const INBOXING_BASE = "https://v2.inboxing.com/api/v2";

function getApiKey(): string | null {
  return process.env.INBOXING_API_KEY ?? null;
}

function headers(apiKey?: string): Record<string, string> {
  const key = apiKey || getApiKey();
  if (!key) throw new Error("INBOXING_API_KEY not configured");
  return {
    "Content-Type": "application/json",
    "X-API-Key": key,
  };
}

// ============================================================
// DOMAINS
// ============================================================

export interface CreateDomainRequest {
  domain: string;
  names: { first_name: string; last_name: string; email_prefix?: string }[];
  user_count: 25 | 49 | 99;
  redirect_url?: string;
  redirect_type?: "NONE" | "REGULAR" | "MASKED";
  tags?: string[];
  upload_to_platform?: boolean;
  platform_connection_id?: string;
  cloudflare_credential_id?: string;
  registrar_credential_id?: string;
}

export interface InboxingDomain {
  id: string;
  domain: string;
  status: string;
  user_count: number;
  mailbox_count: number;
  tags: string[];
  nameservers: string[];
  csv_available_at?: string;
  created_at: string;
}

export async function createDomain(data: CreateDomainRequest): Promise<InboxingDomain> {
  const res = await fetch(`${INBOXING_BASE}/domains`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Inboxing API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function listDomains(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
}): Promise<{ data: InboxingDomain[]; pagination: any }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);

  const res = await fetch(`${INBOXING_BASE}/domains?${qs}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getDomain(id: string): Promise<InboxingDomain> {
  const res = await fetch(`${INBOXING_BASE}/domains/${id}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getDomainStatus(id: string) {
  const res = await fetch(`${INBOXING_BASE}/domains/${id}/status`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getDomainCsv(id: string): Promise<string> {
  const res = await fetch(`${INBOXING_BASE}/domains/${id}/csv`, {
    headers: headers(),
  });
  if (!res.ok) {
    if (res.status === 403) {
      const err = await res.json();
      throw new Error(err.error || "CSV not available yet (24-hour warmup)");
    }
    throw new Error(`Inboxing API error ${res.status}`);
  }
  return res.text();
}

export async function deleteDomain(id: string) {
  const res = await fetch(`${INBOXING_BASE}/domains/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function updateDomainTags(id: string, tags: string[]) {
  const res = await fetch(`${INBOXING_BASE}/domains/${id}/tags`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// PLATFORM UPLOAD
// ============================================================

export async function uploadDomainToPlatform(
  domainId: string,
  opts: {
    platform_connection_id: string;
    enable_warmup?: boolean;
    sync_tags?: boolean;
    skip_verified?: boolean;
  }
) {
  const res = await fetch(`${INBOXING_BASE}/domains/${domainId}/upload`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getUploadStatus(params?: {
  email?: string;
  domain?: string;
  connection_id?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.email) qs.set("email", params.email);
  if (params?.domain) qs.set("domain", params.domain);
  if (params?.connection_id) qs.set("connection_id", params.connection_id);
  if (params?.status) qs.set("status", params.status);

  const res = await fetch(`${INBOXING_BASE}/upload/status?${qs}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// REGISTRARS
// ============================================================

export async function createRegistrar(data: {
  registrar: "PORKBUN" | "GODADDY" | "DYNADOT" | "SPACESHIP";
  name: string;
  api_key: string;
  api_secret?: string;
}) {
  const res = await fetch(`${INBOXING_BASE}/registrars`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function listRegistrars() {
  const res = await fetch(`${INBOXING_BASE}/registrars`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// PLATFORM CONNECTIONS
// ============================================================

export async function createPlatformConnection(data: {
  platform: "plusvibe" | "instantly" | "smartlead" | "email_bison";
  name: string;
  username?: string;
  password?: string;
  api_key?: string;
  workspace_id?: string;
}) {
  const res = await fetch(`${INBOXING_BASE}/platform-connections`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// SLOTS
// ============================================================

export async function getSlots() {
  const res = await fetch(`${INBOXING_BASE}/slots`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}
