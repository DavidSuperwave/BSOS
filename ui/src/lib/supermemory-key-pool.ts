import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";

type JsonMap = Record<string, any>;

function getAdminClient(): SupabaseClient {
  const url = envConfig.supabase.url();
  const serviceRoleKey = envConfig.supabase.serviceRoleKey();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials");
  }
  return createClient(url, serviceRoleKey);
}

function maskKey(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 10) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

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

export async function listSupermemoryPoolKeys() {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("supermemory_key_pool")
    .select("id, label, api_key, is_active, assigned_company_id, assigned_at, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data || []) as SupermemoryPoolRow[];
  const keys = rows.map((row) => ({
    id: row.id,
    label: row.label,
    isActive: row.is_active,
    assignedCompanyId: row.assigned_company_id,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    maskedKey: maskKey(row.api_key),
  }));

  return {
    keys,
    stats: {
      total: rows.length,
      active: rows.filter((r) => r.is_active).length,
      available: rows.filter((r) => r.is_active && !r.assigned_company_id).length,
      assigned: rows.filter((r) => !!r.assigned_company_id).length,
    },
  };
}

export async function addSupermemoryPoolKey(input: { apiKey: string; label?: string | null }) {
  const admin = getAdminClient();
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("API key is required");

  const { data, error } = await admin
    .from("supermemory_key_pool")
    .insert({
      api_key: apiKey,
      label: input.label || null,
      is_active: true,
    })
    .select("id, label, api_key, is_active, assigned_company_id, assigned_at, created_at, updated_at")
    .single();
  if (error) throw error;

  const row = data as SupermemoryPoolRow;
  return {
    id: row.id,
    label: row.label,
    isActive: row.is_active,
    assignedCompanyId: row.assigned_company_id,
    maskedKey: maskKey(row.api_key),
    createdAt: row.created_at,
  };
}

export async function setSupermemoryPoolKeyActive(input: {
  keyId: string;
  isActive: boolean;
}) {
  const admin = getAdminClient();
  const { error } = await admin
    .from("supermemory_key_pool")
    .update({ is_active: input.isActive })
    .eq("id", input.keyId);
  if (error) throw error;
}

export async function releaseSupermemoryKeyForCompany(
  adminClient: SupabaseClient,
  companyId: string
) {
  const { error } = await adminClient
    .from("supermemory_key_pool")
    .update({
      assigned_company_id: null,
      assigned_at: null,
    })
    .eq("assigned_company_id", companyId);
  if (error) throw error;
}

/**
 * Ensures a company has a Supermemory API key.
 * Priority: existing company credential -> available key pool assignment.
 */
export async function ensureCompanySupermemoryKey(
  adminClient: SupabaseClient,
  companyId: string
): Promise<string | null> {
  const { data: company, error: companyError } = await adminClient
    .from("companies")
    .select("integration_credentials")
    .eq("id", companyId)
    .single();
  if (companyError || !company) {
    throw companyError || new Error("Company not found");
  }

  const existingIntegrationCredentials =
    ((company.integration_credentials as JsonMap | null) || {}) as JsonMap;
  const existingSupermemoryKey =
    (existingIntegrationCredentials.supermemory_api_key as string | undefined) || null;
  if (existingSupermemoryKey) {
    return existingSupermemoryKey;
  }

  const { data: availableKey, error: keyError } = await adminClient
    .from("supermemory_key_pool")
    .select("id, api_key")
    .eq("is_active", true)
    .is("assigned_company_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (keyError) throw keyError;
  if (!availableKey) return null;

  // Claim the key first to avoid races.
  const { data: claimedRows, error: claimError } = await adminClient
    .from("supermemory_key_pool")
    .update({
      assigned_company_id: companyId,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", availableKey.id)
    .is("assigned_company_id", null)
    .select("id, api_key")
    .limit(1);
  if (claimError) throw claimError;
  if (!claimedRows || claimedRows.length === 0) {
    return null;
  }

  const claimedKey = (claimedRows[0] as { api_key: string }).api_key;
  const mergedCredentials = {
    ...existingIntegrationCredentials,
    supermemory_api_key: claimedKey,
  };
  const { error: updateCompanyError } = await adminClient
    .from("companies")
    .update({ integration_credentials: mergedCredentials })
    .eq("id", companyId);
  if (updateCompanyError) throw updateCompanyError;

  return claimedKey;
}
