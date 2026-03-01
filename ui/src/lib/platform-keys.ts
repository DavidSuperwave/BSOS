import { createClient } from "@supabase/supabase-js";
import { envConfig } from "./env";

/**
 * Platform key resolver.
 * Checks platform_credentials table first (production),
 * falls back to environment variables (local dev).
 */

const ENV_MAP: Record<string, string> = {
  inboxing: "INBOXING_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  supermemory_admin: "SUPERMEMORY_API_KEY",
};

let _adminClient: ReturnType<typeof createClient> | null = null;

function getAdminClient() {
  if (_adminClient) return _adminClient;
  const url = envConfig.supabase.url();
  const serviceKey = envConfig.supabase.serviceRoleKey();
  if (!url || !serviceKey) return null;
  _adminClient = createClient(url, serviceKey);
  return _adminClient;
}

export async function getPlatformKey(
  service: string
): Promise<string | null> {
  // 1. Check platform_credentials table
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data } = await admin
        .from("platform_credentials")
        .select("api_key")
        .eq("service", service)
        .eq("is_active", true)
        .single();
      const row = data as { api_key: string } | null;
      if (row?.api_key) return row.api_key;
    } catch {
      // Table might not exist or no row — fall through to env
    }
  }

  // 2. Fall back to env var
  const envKey = ENV_MAP[service];
  if (envKey) return process.env[envKey] ?? null;
  return null;
}
