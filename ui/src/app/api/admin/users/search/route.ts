import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/admin/users/search
 * Search for users by email or name (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!query || query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const admin = getAdmin();
    const searchLower = query.toLowerCase();

    const { data: members, error: membersError } = await admin
      .from("account_members")
      .select("user_id, role, account_id");

    if (membersError) throw membersError;

    const accountIds = Array.from(new Set((members || []).map((member: any) => member.account_id).filter(Boolean)));
    const { data: companies, error: companiesError } = accountIds.length
      ? await admin
          .from("companies")
          .select("id, name, slug, account_id")
          .in("account_id", accountIds)
      : { data: [], error: null };

    if (companiesError) throw companiesError;

    const companyByAccount = new Map<string, any>();
    for (const company of companies || []) {
      if (!companyByAccount.has(company.account_id)) {
        companyByAccount.set(company.account_id, company);
      }
    }

    const membershipByUser = new Map<string, any>();
    for (const member of members || []) {
      if (!membershipByUser.has(member.user_id)) {
        membershipByUser.set(member.user_id, member);
      }
    }

    const matchingUsers = [];
    let page = 1;
    const perPage = 200;

    while (matchingUsers.length < limit) {
      const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (usersError) throw usersError;
      const users = userPage?.users || [];
      if (users.length === 0) break;

      for (const user of users) {
        const email = user.email || "";
        const name = String(user.user_metadata?.name || "");

        if (
          email.toLowerCase().includes(searchLower) ||
          name.toLowerCase().includes(searchLower)
        ) {
          const membership = membershipByUser.get(user.id);
          const company = membership ? companyByAccount.get(membership.account_id) : null;

          matchingUsers.push({
            user_id: user.id,
            email,
            name,
            role: membership?.role || null,
            company_id: company?.id || null,
            company_name: company?.name || null,
            company_slug: company?.slug || null,
          });

          if (matchingUsers.length >= limit) break;
        }
      }

      if (users.length < perPage) break;
      page += 1;
    }

    return NextResponse.json({ users: matchingUsers.slice(0, limit) });
  } catch (error: any) {
    console.error("[Admin Users Search] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search users" },
      { status: 500 }
    );
  }
}
