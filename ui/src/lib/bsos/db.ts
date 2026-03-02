/**
 * BSOS Database Helper
 * Shared Supabase admin client for all BSOS modules.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";

let _adminClient: SupabaseClient | null = null;

/**
 * Get a Supabase admin client (service role).
 * Singleton — reused across calls within the same request.
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const url = envConfig.supabase.url();
    const key = envConfig.supabase.serviceRoleKey();
    if (!url || !key) throw new Error("[BSOS DB] Missing Supabase URL or service role key");
    _adminClient = createClient(url, key);
  }
  return _adminClient;
}

/**
 * Check if a user email is a BSOS admin.
 */
export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

/**
 * Verify admin access for an authenticated user.
 */
export async function verifyAdminAccess(userId: string): Promise<boolean> {
  const db = getAdminClient();

  // Check if user has owner role on any account
  const { data: membership } = await db
    .from("account_members")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membership) return true;

  // Fallback: check admin email list
  const { data: user } = await db.auth.admin.getUserById(userId);
  return isAdminEmail(user?.user?.email);
}
