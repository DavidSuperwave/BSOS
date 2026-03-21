import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { applyDefaultSkillPackToCompany } from "@/lib/skills/skill-catalog";
import { hydratePlusVibeInboxAndWebhook } from "@/lib/plusvibe-inbox-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DEFAULT_KNOWLEDGE_PROJECTS = [
  {
    name: "General",
    slug: "general",
    type: "knowledge_base",
    suffix: "general",
    desc: "Core company profile, onboarding data, baseline context",
  },
  {
    name: "ICP Intelligence",
    slug: "icp",
    type: "knowledge_base",
    suffix: "icp",
    desc: "Ideal customer profiles, persona data, audience learnings",
  },
  {
    name: "Campaign Intelligence",
    slug: "campaigns",
    type: "knowledge_base",
    suffix: "campaigns",
    desc: "Copy analysis, performance patterns, angle effectiveness",
  },
  {
    name: "Reply Intelligence",
    slug: "replies",
    type: "knowledge_base",
    suffix: "replies",
    desc: "Reply analysis, sentiment patterns, objection mining",
  },
  {
    name: "Reports & Audits",
    slug: "reports",
    type: "knowledge_base",
    suffix: "reports",
    desc: "Intelligence briefs, audit results, performance snapshots",
  },
  {
    name: "Research",
    slug: "research",
    type: "research",
    suffix: "research",
    desc: "Market research, competitive intel, generated analysis",
  },
] as const;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();

    // Get account IDs from explicit memberships.
    const { data: memberships } = await admin
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id);

    // Also include accounts where this user is the owner. This covers
    // edge-cases where membership rows are missing/out-of-sync.
    const { data: ownedAccounts } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id);

    const accountIds = Array.from(
      new Set([
        ...(memberships || []).map((m: any) => m.account_id),
        ...(ownedAccounts || []).map((a: any) => a.id),
      ].filter(Boolean))
    );

    let accountCompanies: any[] = [];
    if (accountIds.length > 0) {
      const { data: companies, error } = await admin
        .from("companies")
        .select("*")
        .in("account_id", accountIds)
        .order("name");

      if (error) throw error;
      accountCompanies = companies || [];
    }

    // Legacy fallback for pre-account companies.
    const { data: legacyCompanies, error: legacyError } = await admin
      .from("companies")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    if (legacyError) throw legacyError;

    const mergedMap = new Map<string, any>();
    for (const company of accountCompanies) {
      if (company?.id) mergedMap.set(company.id, company);
    }
    for (const company of legacyCompanies || []) {
      if (company?.id && !mergedMap.has(company.id)) {
        mergedMap.set(company.id, company);
      }
    }

    const mergedCompanies = Array.from(mergedMap.values()).sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""))
    );

    return NextResponse.json({ companies: mergedCompanies });
  } catch (err: any) {
    console.error("[Companies API] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, slug, domain } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    const admin = getAdmin();

    // Get user's account
    let { data: membership } = await admin
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      // Auto-provision: create account + membership for this user
      const { data: newAccount, error: acctErr } = await admin
        .from("accounts")
        .insert({
          name: `${user.email?.split("@")[0] || "User"}'s Account`,
          owner_user_id: user.id,
        })
        .select()
        .single();

      if (acctErr || !newAccount) {
        return NextResponse.json(
          { error: "Failed to create account. Please try again." },
          { status: 500 }
        );
      }

      const { error: memberErr } = await admin
        .from("account_members")
        .insert({
          account_id: newAccount.id,
          user_id: user.id,
          role: "owner",
          accepted_at: new Date().toISOString(),
        });

      if (memberErr) {
        // Cleanup the orphaned account
        await admin.from("accounts").delete().eq("id", newAccount.id);
        return NextResponse.json(
          { error: "Failed to create account membership. Please try again." },
          { status: 500 }
        );
      }

      // Use the new account for company creation
      membership = { account_id: newAccount.id };
    }

    const { data: company, error } = await admin
      .from("companies")
      .insert({
        account_id: membership.account_id,
        name,
        slug,
        domain: domain || null,
        status: "onboarding",
        settings: { auto_analyze: false },
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A company with this slug already exists" },
          { status: 409 }
        );
      }
      throw error;
    }

    // Seed default knowledge projects (maps to gtm_{slug}_project_{suffix} containers).
    for (const project of DEFAULT_KNOWLEDGE_PROJECTS) {
      const payload: Record<string, any> = {
        company_id: company.id,
        name: project.name,
        slug: project.slug,
        type: project.type,
        container_tag_suffix: project.suffix,
        description: project.desc,
        created_by: user.id,
      };

      // Keep intake compatibility: deploy-agent currently passes companyId as projectId.
      if (project.slug === "general") {
        payload.id = company.id;
      }

      const { error: projError } = await admin
        .from("knowledge_projects")
        .insert(payload);

      if (projError) {
        console.error(
          `[Companies API] Failed to create knowledge project ${project.slug}:`,
          projError
        );
      }
    }

    // Set canonical Supermemory container tag for the company.
    await admin
      .from("companies")
      .update({
        supermemory_container_tag: `gtm_${company.slug}_project_general`,
      })
      .eq("id", company.id);

    // Initialize learning progress (non-fatal if table is unavailable in older schemas).
    try {
      await admin.from("company_learning_progress").upsert(
        {
          company_id: company.id,
          days_since_onboarding: 1,
          company_handoff_stage: "hce_100",
        },
        {
          onConflict: "company_id",
          ignoreDuplicates: true,
        }
      );
    } catch (learningErr) {
      console.warn(
        "[Companies API] Learning progress initialization skipped:",
        learningErr
      );
    }

    // Seed default skill pack for every new company (idempotent)
    try {
      await applyDefaultSkillPackToCompany({
        admin,
        companyId: company.id,
        createdBy: user.id,
        agentTypes: ["main", "campaigns", "crm", "inbox"],
      });
    } catch (seedErr: any) {
      console.warn("[Companies API] Default skill pack seed skipped:", seedErr?.message || seedErr);
    }

    return NextResponse.json({ company }, { status: 201 });
  } catch (err: any) {
    console.error("[Companies API] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create company" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    const { data: existingCompany } = await admin
      .from("companies")
      .select("integration_credentials")
      .eq("id", id)
      .single();
    const existingCreds =
      (existingCompany?.integration_credentials as Record<string, any> | null) || {};

    const { data: company, error } = await admin
      .from("companies")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    let nextCreds = { ...existingCreds };
    if (
      updateData.integration_credentials &&
      typeof updateData.integration_credentials === "object"
    ) {
      nextCreds = {
        ...nextCreds,
        ...updateData.integration_credentials,
      };
    }
    if ("plusvibe_api_key" in updateData) {
      nextCreds.plusvibe_api_key = updateData.plusvibe_api_key || null;
    }
    if ("plusvibe_workspace_id" in updateData) {
      nextCreds.plusvibe_workspace_id = updateData.plusvibe_workspace_id || null;
    }

    const hadPlusVibe =
      !!existingCreds.plusvibe_api_key && !!existingCreds.plusvibe_workspace_id;
    const hasPlusVibe =
      !!nextCreds.plusvibe_api_key && !!nextCreds.plusvibe_workspace_id;
    const plusVibeChanged =
      existingCreds.plusvibe_api_key !== nextCreds.plusvibe_api_key ||
      existingCreds.plusvibe_workspace_id !== nextCreds.plusvibe_workspace_id;

    let inboxSetup: Record<string, any> | null = null;
    if (hasPlusVibe && (!hadPlusVibe || plusVibeChanged)) {
      try {
        inboxSetup = await hydratePlusVibeInboxAndWebhook(id, req.nextUrl.origin);
      } catch (syncErr: any) {
        inboxSetup = {
          error: syncErr?.message || "Inbox setup failed",
          webhookRegistered: false,
          hydratedCount: 0,
          pagesFetched: 0,
        };
      }
    }

    return NextResponse.json({ company, inbox_setup: inboxSetup });
  } catch (err: any) {
    console.error("[Companies API] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update company" },
      { status: 500 }
    );
  }
}
