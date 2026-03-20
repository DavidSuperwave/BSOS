import { SupabaseClient } from "@supabase/supabase-js";

export interface CompanyCredentials {
  plusvibe_api_key?: string;
  plusvibe_workspace_id?: string;
  close_api_key?: string;
  calendly_api_key?: string;
  calendly_user_uri?: string;
  telegram_token?: string;
  telegram_chat_id?: string;
  perplexity_api_key?: string;
}

/**
 * Canonical credential reader for per-company integration credentials.
 *
 * Reads from integration_credentials JSONB first (canonical source),
 * falls back to flat columns on the companies table for backward compat.
 *
 * IMPORTANT: All new code should use this function. Do NOT read credentials
 * directly from the companies row — the flat columns are deprecated and
 * will be removed in a future migration.
 *
 * The JSONB keys and flat column names differ in some cases:
 * - JSONB: telegram_token -> Flat: telegram_bot_token
 * - JSONB: telegram_chat_id -> Flat: telegram_chat_id (same)
 * - JSONB: plusvibe_workspace_id -> Flat: plusvibe_workspace_id
 */
export async function getCompanyCredentials(
  admin: SupabaseClient,
  companyId: string
): Promise<CompanyCredentials> {
  const { data: company, error } = await admin
    .from("companies")
    .select(`
      integration_credentials,
      plusvibe_api_key,
      plusvibe_workspace_id,
      close_api_key,
      calendly_api_key,
      calendly_user_uri,
      telegram_bot_token,
      telegram_chat_id,
      perplexity_api_key
    `)
    .eq("id", companyId)
    .single();

  if (error || !company) {
    console.error(`Failed to fetch credentials for company ${companyId}:`, error);
    return {};
  }

  const jsonb = (company.integration_credentials as Record<string, string>) || {};

  // JSONB is canonical, flat columns are fallback
  return {
    plusvibe_api_key: jsonb.plusvibe_api_key || company.plusvibe_api_key || undefined,
    plusvibe_workspace_id:
      jsonb.plusvibe_workspace_id || company.plusvibe_workspace_id || undefined,
    close_api_key: jsonb.close_api_key || company.close_api_key || undefined,
    calendly_api_key: jsonb.calendly_api_key || company.calendly_api_key || undefined,
    calendly_user_uri: jsonb.calendly_user_uri || company.calendly_user_uri || undefined,
    telegram_token: jsonb.telegram_token || company.telegram_bot_token || undefined,
    telegram_chat_id: jsonb.telegram_chat_id || company.telegram_chat_id || undefined,
    perplexity_api_key: jsonb.perplexity_api_key || company.perplexity_api_key || undefined,
  };
}

/**
 * Check if a specific credential exists for a company.
 * Useful for conditional logic (e.g., "if PlusVibe is configured, run sync").
 */
export async function hasCredential(
  admin: SupabaseClient,
  companyId: string,
  key: keyof CompanyCredentials
): Promise<boolean> {
  const creds = await getCompanyCredentials(admin, companyId);
  return !!creds[key];
}
