import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { envConfig } from "@/lib/env";
import { applyDefaultSkillPackToCompany } from "@/lib/skills/skill-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
        supermemory_namespace: `blitzscale:company:${slug}`,
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

    // Initialize Supermemory namespace
    const smKey = envConfig.supermemory.apiKey();
    if (smKey) {
      try {
        await fetch("https://api.supermemory.ai/v3/memories", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${smKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: `# Company: ${name}\nSlug: ${slug}\nCreated: ${new Date().toISOString()}`,
            containerTags: [`blitzscale:company:${slug}`, "company-info"],
          }),
        });
      } catch {
        // Non-blocking
      }
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

    const { data: company, error } = await admin
      .from("companies")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ company });
  } catch (err: any) {
    console.error("[Companies API] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update company" },
      { status: 500 }
    );
  }
}
