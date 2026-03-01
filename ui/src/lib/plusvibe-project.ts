/**
 * PlusVibe Project-Level Credentials Helper
 * Supports multi-project setup where each company can have its own PlusVibe API key
 */

import { createClient } from "@supabase/supabase-js";
import { envConfig } from "./env";

export interface PlusVibeCredentials {
  apiKey: string;
  workspaceId: string;
  source: "project" | "global";
}

function getAdminClient() {
  const url = envConfig.supabase.url();
  const serviceKey = envConfig.supabase.serviceRoleKey();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

function isLikelyValidPlusVibePair(apiKey?: string | null, workspaceId?: string | null) {
  if (!apiKey || !workspaceId) return false;
  // Defensive: we have seen bad rows where api key was accidentally saved as workspace ID.
  return apiKey !== workspaceId;
}

/**
 * Get PlusVibe credentials for a specific company/project
 * Falls back to global env vars if project-specific credentials not set
 */
export async function getProjectCredentials(
  companyId?: string
): Promise<PlusVibeCredentials | null> {
  // If no companyId provided, use global credentials
  if (!companyId) {
    const globalApiKey = envConfig.plusvibe.apiKey();
    const globalWorkspaceId = envConfig.plusvibe.workspaceId();

    if (!globalApiKey || !globalWorkspaceId) {
      return null;
    }

    return {
      apiKey: globalApiKey,
      workspaceId: globalWorkspaceId,
      source: "global",
    };
  }

  // Try to get company-specific credentials from Supabase
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data: company } = await admin
        .from("companies")
        .select("plusvibe_api_key, plusvibe_workspace_id, plusvibe_enabled, integration_credentials")
        .eq("id", companyId)
        .single();

      // Check integration_credentials JSONB first (new pattern)
      const intCreds = company?.integration_credentials as Record<string, any> | null;
      const projectApiKey = intCreds?.plusvibe_api_key as string | null | undefined;
      const projectWorkspaceId = intCreds?.plusvibe_workspace_id as string | null | undefined;
      if (
        isLikelyValidPlusVibePair(
          projectApiKey,
          projectWorkspaceId
        )
      ) {
        return {
          apiKey: projectApiKey!,
          workspaceId: projectWorkspaceId!,
          source: "project",
        };
      }

      // Fall back to legacy columns
      if (
        company?.plusvibe_enabled &&
        isLikelyValidPlusVibePair(
          company.plusvibe_api_key,
          company.plusvibe_workspace_id
        )
      ) {
        return {
          apiKey: company.plusvibe_api_key,
          workspaceId: company.plusvibe_workspace_id,
          source: "project",
        };
      }
    }
  } catch (error) {
    console.error("[PlusVibe] Error fetching company credentials:", error);
  }

  // Fall back to global credentials
  const globalApiKey = envConfig.plusvibe.apiKey();
  const globalWorkspaceId = envConfig.plusvibe.workspaceId();

  if (!globalApiKey || !globalWorkspaceId) {
    return null;
  }

  return {
    apiKey: globalApiKey,
    workspaceId: globalWorkspaceId,
    source: "global",
  };
}

/**
 * Update PlusVibe credentials for a company
 */
export async function updateProjectCredentials(
  companyId: string,
  credentials: {
    apiKey?: string;
    workspaceId?: string;
    enabled?: boolean;
  }
) {
  const admin = getAdminClient();
  if (!admin) throw new Error("Supabase admin client not available");

  return admin
    .from("companies")
    .update({
      plusvibe_api_key: credentials.apiKey,
      plusvibe_workspace_id: credentials.workspaceId,
      plusvibe_enabled: credentials.enabled ?? true,
    })
    .eq("id", companyId);
}

/**
 * Test PlusVibe credentials by making a simple API call
 */
export async function testCredentials(
  credentials: PlusVibeCredentials
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${credentials.workspaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credentials.apiKey,
        },
      }
    );

    if (response.ok) {
      return { success: true };
    } else {
      const error = await response.text();
      return { success: false, error: `API Error: ${response.status} - ${error}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get PlusVibe API headers for a company
 */
export async function getPlusVibeHeaders(
  companyId?: string
): Promise<{ headers: Record<string, string>; workspaceId: string } | null> {
  const credentials = await getProjectCredentials(companyId);

  if (!credentials) {
    return null;
  }

  return {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": credentials.apiKey,
    },
    workspaceId: credentials.workspaceId,
  };
}
