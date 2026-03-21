import { SupabaseClient } from "@supabase/supabase-js";
import { envConfig } from "./env";

/**
 * DEPRECATED: Key pool replaced with global SUPERMEMORY_API_KEY env var.
 * Supermemory v3 uses one global key with containerTag isolation per company.
 * This shim preserves exports so existing imports don't break.
 *
 * The supermemory_key_pool table in Supabase is deprecated and will be dropped
 * once all references to this file are removed.
 */

export interface SupermemoryPoolRow {
  id: string;
  label: string | null;
  api_key: string;
  is_active: boolean;
  assigned_company_id: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

function maskKey(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 10) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

export async function ensureCompanySupermemoryKey(
  _admin: any,
  _companyId: string
): Promise<string> {
  const key = envConfig.supermemory.apiKey();
  if (!key) {
    throw new Error(
      "SUPERMEMORY_API_KEY environment variable is not set. " +
      "This is a global key that handles all companies via containerTag isolation."
    );
  }
  return key;
}

export async function getCompanySupermemoryKey(
  _admin: any,
  _companyId: string
): Promise<string | null> {
  return envConfig.supermemory.apiKey() || null;
}

/**
 * Deprecated admin helper shim.
 * Returns a synthetic one-key "pool" from the global env key.
 */
export async function listSupermemoryPoolKeys() {
  const key = envConfig.supermemory.apiKey();
  if (!key) {
    return {
      keys: [],
      stats: { total: 0, active: 0, available: 0, assigned: 0 },
    };
  }

  return {
    keys: [
      {
        id: "global-env-key",
        label: "Global SUPERMEMORY_API_KEY (deprecated pool)",
        isActive: true,
        assignedCompanyId: null,
        assignedAt: null,
        createdAt: null,
        updatedAt: null,
        maskedKey: maskKey(key),
      },
    ],
    stats: { total: 1, active: 1, available: 1, assigned: 0 },
  };
}

/**
 * Deprecated admin helper shim.
 * Adding pool keys is disabled after migration to global env key.
 */
export async function addSupermemoryPoolKey(_input: {
  apiKey: string;
  label?: string | null;
}) {
  throw new Error(
    "Supermemory key pool is deprecated. Configure SUPERMEMORY_API_KEY in environment instead."
  );
}

/**
 * Deprecated admin helper shim.
 * No-op because pool activation flags are no longer used.
 */
export async function setSupermemoryPoolKeyActive(_input: {
  keyId: string;
  isActive: boolean;
}) {
  return;
}

/**
 * Deprecated admin helper shim.
 * No-op because no company-specific key assignments exist anymore.
 */
export async function releaseSupermemoryKeyForCompany(
  _adminClient: SupabaseClient,
  _companyId: string
) {
  return;
}
