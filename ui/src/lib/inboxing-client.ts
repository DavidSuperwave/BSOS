/**
 * Inboxing API v2 Client — Refactored for Distribution System
 * 
 * DUAL-MODE API KEY RESOLUTION:
 * 1. Platform Key (INBOXING_API_KEY env var) — used by admin for bulk operations
 *    and by the distribution system when provisioning from the Superwave pool.
 * 2. Company Key (from companies.integration_credentials) — used when a company
 *    brings their own Inboxing account (BYO mode).
 * 
 * SECURITY: All list/get operations go through Supabase (company_id scoped),
 * never expose raw Inboxing API responses to end users.
 * 
 * Base URL: https://v2.inboxing.com/api/v2
 * Auth: X-API-Key header
 * Rate Limit: 120 req/min
 */

const INBOXING_BASE = "https://v2.inboxing.com/api/v2";

// ============================================================
// KEY RESOLUTION
// ============================================================

/**
 * Get the platform-level Inboxing API key (Superwave's account).
 * Used for admin operations and managed domain provisioning.
 */
function getPlatformApiKey(): string | null {
  return process.env.INBOXING_API_KEY ?? null;
}

/**
 * Resolve the correct API key for a request.
 * Priority:
 *   1. Explicit key passed in (for admin/platform operations)
 *   2. Company key from integration_credentials (BYO mode)
 *   3. Platform key (managed mode — Superwave controls the domains)
 * 
 * @param opts.apiKey - Explicit key override
 * @param opts.companyInboxingKey - Company's own Inboxing key (from DB)
 * @param opts.usePlatformKey - Force platform key (admin operations)
 */
function resolveApiKey(opts?: {
  apiKey?: string;
  companyInboxingKey?: string | null;
  usePlatformKey?: boolean;
}): string {
  // Explicit override
  if (opts?.apiKey) return opts.apiKey;
  
  // Force platform key for admin/managed operations
  if (opts?.usePlatformKey) {
    const platformKey = getPlatformApiKey();
    if (!platformKey) throw new Error("INBOXING_API_KEY not configured in environment");
    return platformKey;
  }
  
  // Company's own key (BYO mode)
  if (opts?.companyInboxingKey) return opts.companyInboxingKey;
  
  // Default: platform key
  const platformKey = getPlatformApiKey();
  if (!platformKey) throw new Error("INBOXING_API_KEY not configured");
  return platformKey;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

// ============================================================
// REQUEST CONTEXT — passed to every API call
// ============================================================

export interface InboxingRequestContext {
  /** Explicit API key override */
  apiKey?: string;
  /** Company's own Inboxing API key (from integration_credentials) */
  companyInboxingKey?: string | null;
  /** Force use of Superwave's platform key (admin/managed operations) */
  usePlatformKey?: boolean;
}

// ============================================================
// TYPES
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

export interface InboxingSlots {
  total: number;
  used: number;
  available: number;
}

export interface InboxingPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// ============================================================
// DOMAINS
// ============================================================

/**
 * Create a domain with mailboxes via Inboxing.com.
 * For managed mode: uses platform key (admin buying inventory).
 * For BYO mode: uses company's own key.
 */
export async function createDomain(
  data: CreateDomainRequest,
  ctx?: InboxingRequestContext
): Promise<InboxingDomain> {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains`, {
    method: "POST",
    headers: buildHeaders(key),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Inboxing API error ${res.status}: ${err}`);
  }
  return res.json();
}

/**
 * List all domains under the resolved API key.
 * WARNING: In platform mode, this returns ALL Superwave domains.
 * Always filter through Supabase domain_inventory for tenant isolation.
 */
export async function listDomains(
  params?: {
    page?: number;
    per_page?: number;
    status?: string;
    search?: string;
  },
  ctx?: InboxingRequestContext
): Promise<{ data: InboxingDomain[]; pagination: InboxingPagination }> {
  const key = resolveApiKey(ctx);
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);

  const res = await fetch(`${INBOXING_BASE}/domains?${qs}`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getDomain(
  id: string,
  ctx?: InboxingRequestContext
): Promise<InboxingDomain> {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${id}`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getDomainStatus(
  id: string,
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${id}/status`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getDomainCsv(
  id: string,
  ctx?: InboxingRequestContext
): Promise<string> {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${id}/csv`, {
    headers: buildHeaders(key),
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

export async function deleteDomain(
  id: string,
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${id}`, {
    method: "DELETE",
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function updateDomainTags(
  id: string,
  tags: string[],
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${id}/tags`, {
    method: "PUT",
    headers: buildHeaders(key),
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
  },
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${domainId}/upload`, {
    method: "POST",
    headers: buildHeaders(key),
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function getUploadStatus(
  params?: {
    email?: string;
    domain?: string;
    connection_id?: string;
    status?: string;
  },
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const qs = new URLSearchParams();
  if (params?.email) qs.set("email", params.email);
  if (params?.domain) qs.set("domain", params.domain);
  if (params?.connection_id) qs.set("connection_id", params.connection_id);
  if (params?.status) qs.set("status", params.status);

  const res = await fetch(`${INBOXING_BASE}/upload/status?${qs}`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// REGISTRARS
// ============================================================

export async function createRegistrar(
  data: {
    registrar: "PORKBUN" | "GODADDY" | "DYNADOT" | "SPACESHIP";
    name: string;
    api_key: string;
    api_secret?: string;
  },
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/registrars`, {
    method: "POST",
    headers: buildHeaders(key),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

export async function listRegistrars(ctx?: InboxingRequestContext) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/registrars`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// PLATFORM CONNECTIONS
// ============================================================

export async function createPlatformConnection(
  data: {
    platform: "plusvibe" | "instantly" | "smartlead" | "email_bison";
    name: string;
    username?: string;
    password?: string;
    api_key?: string;
    workspace_id?: string;
  },
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/platform-connections`, {
    method: "POST",
    headers: buildHeaders(key),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// SLOTS
// ============================================================

/**
 * Get current slot usage for the API key.
 * In platform mode: returns Superwave's total slot count.
 */
export async function getSlots(ctx?: InboxingRequestContext): Promise<InboxingSlots> {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/slots`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

// ============================================================
// DOMAIN MANAGEMENT (additional endpoints)
// ============================================================

/**
 * Get domain lease information.
 */
export async function getDomainLease(
  domainId: string,
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${domainId}/lease`, {
    headers: buildHeaders(key),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}

/**
 * Update domain forwarding settings.
 */
export async function updateDomainForwarding(
  domainId: string,
  data: { forward_to: string; forward_type?: "redirect" | "mask" },
  ctx?: InboxingRequestContext
) {
  const key = resolveApiKey(ctx);
  const res = await fetch(`${INBOXING_BASE}/domains/${domainId}/forwarding`, {
    method: "PUT",
    headers: buildHeaders(key),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Inboxing API error ${res.status}`);
  return res.json();
}
