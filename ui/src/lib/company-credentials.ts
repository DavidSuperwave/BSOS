/**
 * Company-scoped credential resolution.
 * ONLY uses integration credentials from the companies table.
 * NO fallback to global env vars - each company must provide their own credentials.
 */

import { createClient } from "@supabase/supabase-js";
import { envConfig } from "./env";

function getAdminClient() {
  const url = envConfig.supabase.url();
  const serviceKey = envConfig.supabase.serviceRoleKey();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

const CALENDLY_BASE = "https://api.calendly.com";

/**
 * Check if PlusVibe credentials look valid.
 * API key should NOT be the same as workspace ID.
 */
function isLikelyValidPlusVibePair(apiKey?: string | null, workspaceId?: string | null): boolean {
  if (!apiKey || !workspaceId) return false;
  // If apiKey equals workspaceId, it's likely misconfigured
  if (apiKey === workspaceId) return false;
  // Basic length check - PlusVibe API keys are typically longer
  if (apiKey.length < 20) return false;
  return true;
}

async function resolveCalendlyUserUri(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${CALENDLY_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.resource?.uri || data?.resource?.owner || null;
  } catch {
    return null;
  }
}

export interface CompanyCredentials {
  plusvibe_api_key: string | null;
  plusvibe_workspace_id: string | null;
  calendly_api_key: string | null;
  calendly_user_uri: string | null;
  close_api_key: string | null;
  perplexity_api_key: string | null;
  supermemory_api_key: string | null;
}

/**
 * Fetch integration credentials for a company.
 * ONLY uses per-company values from integration_credentials JSONB.
 * NO global env fallbacks - forces proper multi-tenant isolation.
 */
export async function getCompanyCredentials(
  companyId: string
): Promise<CompanyCredentials> {
  // Test/Shared Supermemory key for companies without their own
  const testSupermemoryKey = envConfig.supermemory.apiKey();

  // Default to null - no global fallbacks (except supermemory test key)
  const defaults: CompanyCredentials = {
    plusvibe_api_key: null,
    plusvibe_workspace_id: null,
    calendly_api_key: null,
    calendly_user_uri: null,
    close_api_key: null,
    perplexity_api_key: null,
    supermemory_api_key: testSupermemoryKey, // Fallback to test key
  };

  try {
    const admin = getAdminClient();
    if (!admin) return defaults;

    const { data: company } = await admin
      .from("companies")
      .select("integration_credentials, plusvibe_api_key, plusvibe_workspace_id, name")
      .eq("id", companyId)
      .single();

    if (!company) return defaults;

    const ic = (company.integration_credentials as Record<string, any>) || {};
    
    // Try integration_credentials JSONB first (new format)
    const icPlusVibeKey = ic.plusvibe_api_key as string | null | undefined;
    const icPlusVibeWorkspace = ic.plusvibe_workspace_id as string | null | undefined;
    
    // Fall back to legacy columns if needed
    const legacyPlusVibeKey = company.plusvibe_api_key as string | null | undefined;
    const legacyPlusVibeWorkspace = company.plusvibe_workspace_id as string | null | undefined;
    
    // Determine PlusVibe credentials - prefer integration_credentials, validate pair
    let plusVibeApiKey: string | null = null;
    let plusVibeWorkspaceId: string | null = null;
    
    if (isLikelyValidPlusVibePair(icPlusVibeKey, icPlusVibeWorkspace)) {
      plusVibeApiKey = icPlusVibeKey ?? null;
      plusVibeWorkspaceId = icPlusVibeWorkspace ?? null;
    } else if (isLikelyValidPlusVibePair(legacyPlusVibeKey, legacyPlusVibeWorkspace)) {
      plusVibeApiKey = legacyPlusVibeKey ?? null;
      plusVibeWorkspaceId = legacyPlusVibeWorkspace ?? null;
    }
    
    // Log warning if PlusVibe key looks misconfigured
    if (icPlusVibeKey && icPlusVibeKey === icPlusVibeWorkspace) {
      console.warn(`[CompanyCredentials] PlusVibe API key equals workspace ID for company ${companyId} (${company.name}) - likely misconfigured`);
    }

    // Calendly - only from integration_credentials
    const calendlyApiKey = (ic.calendly_api_key as string | null | undefined) || null;
    let calendlyUserUri = (ic.calendly_user_uri as string | null | undefined) || null;
    
    // Auto-resolve Calendly user URI if missing but API key exists
    if (calendlyApiKey && !calendlyUserUri) {
      calendlyUserUri = await resolveCalendlyUserUri(calendlyApiKey);
      if (calendlyUserUri) {
        try {
          // Persist resolved URI back to database
          await admin
            .from("companies")
            .update({
              integration_credentials: {
                ...ic,
                calendly_api_key: calendlyApiKey,
                calendly_user_uri: calendlyUserUri,
              },
            })
            .eq("id", companyId);
          console.log(`[CompanyCredentials] Auto-resolved and persisted Calendly user URI for ${companyId}`);
        } catch {
          // Non-blocking: use resolved URI for this request even if persistence fails.
        }
      }
    }

    return {
      plusvibe_api_key: plusVibeApiKey,
      plusvibe_workspace_id: plusVibeWorkspaceId,
      calendly_api_key: calendlyApiKey,
      calendly_user_uri: calendlyUserUri,
      close_api_key: (ic.close_api_key as string | null | undefined) || null,
      perplexity_api_key: (ic.perplexity_api_key as string | null | undefined) || null,
      supermemory_api_key: (ic.supermemory_api_key as string | null | undefined) || testSupermemoryKey,
    };
  } catch (error) {
    console.error("[CompanyCredentials] Error fetching:", error);
    return defaults;
  }
}
