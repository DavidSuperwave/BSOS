/**
 * Inboxing Slot Management Utilities
 * 
 * Provides functions to check and manage slot allocations for companies.
 * Used by protected API routes to ensure users only access their assigned slots.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export interface SlotInfo {
  total_slots: number;
  used_slots: number;
  available_slots: number;
  allocation_type: "free" | "purchased" | "trial";
}

/**
 * Get slot information for a company
 */
export async function getCompanySlots(companyId: string): Promise<SlotInfo | null> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("inboxing_slot_allocations")
    .select("total_slots, used_slots, allocation_type")
    .eq("company_id", companyId)
    .single();

  if (error || !data) {
    // Initialize with 0 slots if not found
    return {
      total_slots: 0,
      used_slots: 0,
      available_slots: 0,
      allocation_type: "free",
    };
  }

  return {
    total_slots: data.total_slots,
    used_slots: data.used_slots,
    available_slots: data.total_slots - data.used_slots,
    allocation_type: data.allocation_type,
  };
}

/**
 * Check if company has available slots
 */
export async function hasAvailableSlots(companyId: string, required: number = 1): Promise<boolean> {
  const slots = await getCompanySlots(companyId);
  if (!slots) return false;
  return slots.available_slots >= required;
}

/**
 * Get all domains assigned to a company
 */
export async function getCompanyAssignedDomains(companyId: string): Promise<string[]> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("inboxing_domain_assignments")
    .select("inboxing_id")
    .eq("company_id", companyId)
    .eq("status", "active");

  if (error || !data) return [];
  return data.map((d: any) => d.inboxing_id);
}

/**
 * Verify that a domain belongs to a company
 */
export async function verifyDomainAccess(
  companyId: string,
  inboxingId: string
): Promise<boolean> {
  const admin = getAdmin();
  const { data: assignment } = await admin
    .from("inboxing_domain_assignments")
    .select("id")
    .eq("company_id", companyId)
    .eq("inboxing_id", inboxingId)
    .eq("status", "active")
    .maybeSingle();

  if (assignment) return true;

  const { data: localDomain } = await admin
    .from("inboxing_domains")
    .select("id")
    .eq("company_id", companyId)
    .eq("inboxing_id", inboxingId)
    .maybeSingle();

  return !!localDomain;
}

/**
 * Allocate slots to a company
 */
export async function allocateSlots(
  companyId: string,
  slots: number,
  allocationType: "free" | "purchased" | "trial" = "free",
  expiresAt?: Date
): Promise<void> {
  const admin = getAdmin();
  const { error } = await admin
    .from("inboxing_slot_allocations")
    .upsert(
      {
        company_id: companyId,
        total_slots: slots,
        allocation_type: allocationType,
        expires_at: expiresAt?.toISOString() || null,
      },
      { onConflict: "company_id" }
    );

  if (error) throw new Error(`Failed to allocate slots: ${error.message}`);
}

/**
 * Increment used slots (called when domain is assigned)
 */
export async function incrementUsedSlots(companyId: string): Promise<void> {
  const admin = getAdmin();
  const { error } = await admin.rpc("increment_company_slots", {
    p_company_id: companyId,
  });

  if (error) throw new Error(`Failed to increment slots: ${error.message}`);
}

/**
 * Decrement used slots (called when domain is reclaimed)
 */
export async function decrementUsedSlots(companyId: string): Promise<void> {
  const admin = getAdmin();
  const { error } = await admin.rpc("decrement_company_slots", {
    p_company_id: companyId,
  });

  if (error) throw new Error(`Failed to decrement slots: ${error.message}`);
}
