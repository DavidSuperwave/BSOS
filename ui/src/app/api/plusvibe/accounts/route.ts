import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function sanitizeError(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

function toAccountsArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.data?.email_accounts)) return payload.data.email_accounts;
  if (Array.isArray(payload?.email_accounts)) return payload.email_accounts;
  return [];
}

function inferEsp(account: Record<string, any>, email: string) {
  const hint = String(
    account?.esp ||
      account?.provider ||
      account?.service_provider ||
      account?.mailbox_provider ||
      account?.smtp_provider ||
      account?.type ||
      ""
  ).toLowerCase();
  const smtpHost = String(account?.smtp_host || account?.host || "").toLowerCase();
  const source = `${hint} ${smtpHost} ${email.toLowerCase()}`;
  if (source.includes("gmail") || source.includes("google") || source.includes("gsuite")) {
    return "gmail";
  }
  if (
    source.includes("microsoft") ||
    source.includes("outlook") ||
    source.includes("office365") ||
    source.includes("exchange")
  ) {
    return "microsoft";
  }
  return "smtp";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;
  const limit = Number(searchParams.get("limit") || "100");

  if (companyId) {
    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;
  }

  const credentials = await getProjectCredentials(companyId);
  
  if (!credentials) {
    return NextResponse.json(
      { error: "PlusVibe API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    const query = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      limit: String(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 100),
    });
    const res = await fetch(
      `${PLUSVIBE_BASE}/account/list?${query.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credentials.apiKey,
        },
      }
    );
    
    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${res.status}`,
          details: sanitizeError(errorText),
        },
        { status: res.status }
      );
    }
    
    const payload = await res.json();
    const rawAccounts = toAccountsArray(payload);
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: managedDomainRows } = companyId
      ? await admin
          .from("inboxing_domains")
          .select("domain")
          .eq("company_id", companyId)
      : { data: [] as Array<{ domain: string }> };
    const managedDomains = new Set(
      (managedDomainRows || [])
        .map((row) => String(row.domain || "").toLowerCase().trim())
        .filter(Boolean)
    );

    const accounts = rawAccounts.map((account: any, index: number) => {
      const email = String(account?.email || account?.email_account || account?.username || "").trim();
      const domain = email.includes("@") ? email.split("@")[1].toLowerCase().trim() : "";
      const esp = inferEsp(account, email);
      const isManagedDomain = managedDomains.has(domain);
      return {
        id: String(account?._id || account?.id || account?.account_id || `account-${index}`),
        email,
        domain,
        esp,
        provider_type: esp,
        warmup_status: account?.warmup_status || account?.warmup || null,
        status: account?.status || "unknown",
        is_managed_domain: isManagedDomain,
        provider_access: isManagedDomain ? "full" : "external_provider",
        external_provider: !isManagedDomain,
        raw: account,
      };
    });

    const domainSummaryMap = new Map<
      string,
      { domain: string; user_count: number; managed: boolean }
    >();
    for (const account of accounts) {
      if (!account.domain) continue;
      const current = domainSummaryMap.get(account.domain);
      if (!current) {
        domainSummaryMap.set(account.domain, {
          domain: account.domain,
          user_count: 1,
          managed: account.is_managed_domain,
        });
      } else {
        current.user_count += 1;
        current.managed = current.managed || account.is_managed_domain;
      }
    }

    return NextResponse.json({
      accounts,
      summary: {
        total_accounts: accounts.length,
        total_domains: domainSummaryMap.size,
        managed_domains: Array.from(domainSummaryMap.values()).filter((d) => d.managed).length,
        external_domains: Array.from(domainSummaryMap.values()).filter((d) => !d.managed).length,
        by_domain: Array.from(domainSummaryMap.values()).sort((a, b) =>
          a.domain.localeCompare(b.domain)
        ),
      },
      credentialsSource: credentials.source,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
