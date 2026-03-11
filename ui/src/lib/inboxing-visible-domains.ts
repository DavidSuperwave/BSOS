import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

type RedirectType = "NONE" | "REGULAR" | "MASKED";

interface LocalDomainRow {
  id: string;
  company_id: string;
  domain: string;
  status: string;
  inboxing_id?: string | null;
  mailbox_count?: number | null;
  user_count?: number | null;
  tags?: string[] | null;
  nameservers?: string[] | null;
  redirect_url?: string | null;
  redirect_type?: RedirectType | null;
  health_score?: number | null;
  dns_spf?: boolean | null;
  dns_dkim?: boolean | null;
  dns_dmarc?: boolean | null;
  campaign_id?: string | null;
  created_at: string;
}

interface AssignmentRow {
  inboxing_id: string;
  domain_name?: string | null;
  assigned_at?: string | null;
  inboxing_domains?: LocalDomainRow | LocalDomainRow[] | null;
}

export interface VisibleInboxingDomain {
  id: string;
  company_id: string;
  domain: string;
  status: string;
  inboxing_id?: string;
  mailbox_count: number;
  user_count?: number;
  tags: string[];
  nameservers?: string[];
  redirect_url?: string | null;
  redirect_type?: RedirectType;
  health_score: number;
  dns_spf: boolean;
  dns_dkim: boolean;
  dns_dmarc: boolean;
  campaign_id?: string | null;
  created_at: string;
  assigned_at?: string | null;
  access_mode: "local" | "assignment";
  can_manage: boolean;
  can_upload: boolean;
  can_download_csv: boolean;
  can_view_nameservers: boolean;
}

function normalizeLocalDomain(domain: LocalDomainRow): VisibleInboxingDomain {
  return {
    id: domain.id,
    company_id: domain.company_id,
    domain: domain.domain,
    status: domain.status,
    inboxing_id: domain.inboxing_id || undefined,
    mailbox_count: domain.mailbox_count || 0,
    user_count: domain.user_count || undefined,
    tags: domain.tags || [],
    nameservers: domain.nameservers || [],
    redirect_url: domain.redirect_url || null,
    redirect_type: domain.redirect_type || "NONE",
    health_score: domain.health_score || 0,
    dns_spf: Boolean(domain.dns_spf),
    dns_dkim: Boolean(domain.dns_dkim),
    dns_dmarc: Boolean(domain.dns_dmarc),
    campaign_id: domain.campaign_id || null,
    created_at: domain.created_at,
    access_mode: "local",
    can_manage: true,
    can_upload: Boolean(domain.inboxing_id) && domain.status === "active",
    can_download_csv: Boolean(domain.inboxing_id),
    can_view_nameservers: true,
  };
}

export async function getCompanyVisibleDomains(companyId: string): Promise<VisibleInboxingDomain[]> {
  const admin = getAdmin();
  const [{ data: localDomains, error: localError }, { data: assignments, error: assignmentError }] =
    await Promise.all([
      admin
        .from("inboxing_domains")
        .select(
          "id, company_id, domain, status, inboxing_id, mailbox_count, user_count, tags, nameservers, redirect_url, redirect_type, health_score, dns_spf, dns_dkim, dns_dmarc, campaign_id, created_at"
        )
        .eq("company_id", companyId),
      admin
        .from("inboxing_domain_assignments")
        .select(
          "inboxing_id, domain_name, assigned_at, inboxing_domains(id, company_id, domain, status, inboxing_id, mailbox_count, user_count, tags, nameservers, redirect_url, redirect_type, health_score, dns_spf, dns_dkim, dns_dmarc, campaign_id, created_at)"
        )
        .eq("company_id", companyId)
        .eq("status", "active"),
    ]);

  if (localError) throw localError;
  if (assignmentError) throw assignmentError;

  const normalizedLocalDomains = (localDomains || []).map(normalizeLocalDomain);
  const localProviderIds = new Set(
    normalizedLocalDomains.map((domain) => domain.inboxing_id).filter((value): value is string => Boolean(value))
  );

  const assignmentOnly = ((assignments || []) as AssignmentRow[]).filter(
    (assignment) => assignment.inboxing_id && !localProviderIds.has(assignment.inboxing_id)
  );

  const assignmentDomains = assignmentOnly.map((assignment) => {
    const localDomain = Array.isArray(assignment.inboxing_domains)
      ? assignment.inboxing_domains[0]
      : assignment.inboxing_domains;

    return {
      id: assignment.inboxing_id,
      company_id: companyId,
      domain: assignment.domain_name || localDomain?.domain || assignment.inboxing_id,
      status: localDomain?.status || "assigned",
      inboxing_id: assignment.inboxing_id,
      mailbox_count: localDomain?.mailbox_count ?? 0,
      user_count: localDomain?.user_count ?? undefined,
      tags: localDomain?.tags || [],
      nameservers: localDomain?.nameservers || [],
      redirect_url: localDomain?.redirect_url ?? null,
      redirect_type: localDomain?.redirect_type || "NONE",
      health_score: localDomain?.health_score || 0,
      dns_spf: Boolean(localDomain?.dns_spf),
      dns_dkim: Boolean(localDomain?.dns_dkim),
      dns_dmarc: Boolean(localDomain?.dns_dmarc),
      campaign_id: localDomain?.campaign_id ?? null,
      created_at: localDomain?.created_at || assignment.assigned_at || new Date().toISOString(),
      assigned_at: assignment.assigned_at ?? null,
      access_mode: "assignment" as const,
      can_manage: false,
      can_upload: localDomain?.status === "active",
      can_download_csv: true,
      can_view_nameservers: true,
    };
  });

  return [...normalizedLocalDomains, ...assignmentDomains].sort((a, b) => {
    const aDate = new Date(a.assigned_at || a.created_at).getTime();
    const bDate = new Date(b.assigned_at || b.created_at).getTime();
    return bDate - aDate;
  });
}
