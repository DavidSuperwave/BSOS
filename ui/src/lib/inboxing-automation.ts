import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as inboxing from "@/lib/inboxing-client";
import { hasAvailableSlots } from "@/lib/inboxing-slots";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: SupabaseClient | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

type SenderName = {
  first_name: string;
  last_name: string;
  email_prefix?: string;
};

export type InboxingAutomationInput = {
  companyId: string;
  domains: string[];
  names: SenderName[];
  userCount?: 25 | 49 | 99;
  tags?: string[];
  redirectUrl?: string;
  redirectType?: "NONE" | "REGULAR" | "MASKED";
  autoUpload?: boolean;
  platformConnectionId?: string;
  registrarId?: string;
  campaignId?: string;
  cloudflareCredentialId?: string;
  requestedBy?: string;
  createAssignments?: boolean;
  enforceSlots?: boolean;
  usePlatformKey?: boolean;
  notes?: string;
};

export type InboxingAutomationDomainResult = {
  domain: string;
  status: string;
  id?: string;
  inboxing_id?: string;
  error?: string;
};

export type InboxingAutomationResult = {
  workflow: {
    requested: number;
    succeeded: number;
    failed: number;
    slots_checked: boolean;
    slots_required: number;
  };
  results: InboxingAutomationDomainResult[];
};

function normalizeDomains(domains: string[]) {
  return Array.from(
    new Set(
      (domains || [])
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export async function runInboxingAutomationWorkflow(
  input: InboxingAutomationInput,
  admin = getAdmin()
): Promise<InboxingAutomationResult> {
  const domains = normalizeDomains(input.domains);
  const names = Array.isArray(input.names) ? input.names.filter((n) => n?.first_name?.trim()) : [];

  if (!input.companyId) {
    throw new Error("companyId is required");
  }
  if (domains.length === 0) {
    throw new Error("At least one domain is required");
  }
  if (names.length === 0) {
    throw new Error("At least one sender name is required");
  }

  if (input.enforceSlots) {
    const hasSlots = await hasAvailableSlots(input.companyId, domains.length);
    if (!hasSlots) {
      throw new Error(
        `No available slots for ${domains.length} domain(s). Allocate more slots and retry.`
      );
    }
  }

  const results: InboxingAutomationDomainResult[] = [];

  for (const domainName of domains) {
    let inboxingResult: any = null;

    try {
      inboxingResult = await inboxing.createDomain(
        {
          domain: domainName,
          names,
          user_count: input.userCount === 25 || input.userCount === 99 ? input.userCount : 49,
          redirect_url: input.redirectUrl,
          redirect_type: input.redirectType || "NONE",
          tags: input.tags || [],
          upload_to_platform: Boolean(input.autoUpload),
          platform_connection_id: input.platformConnectionId || undefined,
          cloudflare_credential_id: input.cloudflareCredentialId || undefined,
          registrar_credential_id: input.registrarId || undefined,
        },
        input.usePlatformKey ? { usePlatformKey: true } : undefined
      );
    } catch (error: any) {
      // Keep backward compatibility with existing flow: still persist pending row.
      console.error(`[Inboxing Automation] Failed to create ${domainName}:`, error?.message || error);
    }

    const { data: insertedDomain, error: insertError } = await admin
      .from("inboxing_domains")
      .insert({
        company_id: input.companyId,
        domain: domainName,
        status: inboxingResult?.status || "pending",
        inboxing_id: inboxingResult?.id || null,
        registrar_id: input.registrarId || null,
        platform_connection_id: input.platformConnectionId || null,
        user_count: input.userCount || 49,
        mailbox_count: inboxingResult?.mailbox_count || 0,
        tags: input.tags || [],
        campaign_id: input.campaignId || null,
        redirect_url: input.redirectUrl || null,
        redirect_type: input.redirectType || "NONE",
        cloudflare_id: input.cloudflareCredentialId || null,
        nameservers: inboxingResult?.nameservers || [],
        csv_available_at: inboxingResult?.csv_available_at || null,
      })
      .select()
      .single();

    if (insertError) {
      results.push({
        domain: domainName,
        status: "error",
        error: insertError.message,
      });
      continue;
    }

    if (input.createAssignments !== false && inboxingResult?.id) {
      const { error: assignmentError } = await admin
        .from("inboxing_domain_assignments")
        .upsert(
          {
            company_id: input.companyId,
            inboxing_domain_id: insertedDomain.id,
            inboxing_id: String(inboxingResult.id),
            domain_name: domainName,
            assigned_by: input.requestedBy || null,
            assigned_at: new Date().toISOString(),
            notes: input.notes || "Auto-provisioned via inboxing automation workflow",
            status: "active",
          },
          { onConflict: "inboxing_id,company_id" }
        );

      if (assignmentError) {
        console.error(
          `[Inboxing Automation] Failed assignment for ${domainName}:`,
          assignmentError.message
        );
      }
    }

    await admin.from("inboxing_jobs").insert({
      company_id: input.companyId,
      domain_id: insertedDomain.id,
      type: "domain_create",
      status: "processing",
      payload: {
        domain: domainName,
        user_count: input.userCount || 49,
        names,
        auto_upload: Boolean(input.autoUpload),
        platform_connection_id: input.platformConnectionId || null,
        enable_warmup: true,
        sync_tags: true,
      },
    });

    results.push({
      domain: domainName,
      status: inboxingResult?.status || "pending",
      id: insertedDomain.id,
      inboxing_id: inboxingResult?.id || undefined,
    });
  }

  const succeeded = results.filter((r) => r.status !== "error").length;
  const failed = results.length - succeeded;

  return {
    workflow: {
      requested: domains.length,
      succeeded,
      failed,
      slots_checked: Boolean(input.enforceSlots),
      slots_required: domains.length,
    },
    results,
  };
}
