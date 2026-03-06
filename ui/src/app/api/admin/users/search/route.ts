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

    // Get all account members
    const { data: members, error: membersError} = await admin
      .from("account_members")
      .select("user_id, role, account_id")
      .limit(1000);

    if (membersError) throw membersError;

    // Fetch all companies separately and map by account_id
    const { data: companies } = await admin
      .from("companies")
      .select("id, name, slug, account_id");

    const companyByAccountId = new Map<string, { id: string; name: string; slug: string }>();
    for (const company of companies || []) {
      if (!company.account_id) continue;
      if (!companyByAccountId.has(company.account_id)) {
        companyByAccountId.set(company.account_id, {
          id: company.id,
          name: company.name,
          slug: company.slug,
        });
      }
    }

    // Search through users
    const matchingUsers = [];
    const seenUserIds = new Set<string>();
    const searchLower = query.toLowerCase();

    for (const member of members || []) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(member.user_id);
        const email = userData?.user?.email || "";
        const name = userData?.user?.user_metadata?.name || "";

        if (
          email.toLowerCase().includes(searchLower) ||
          name.toLowerCase().includes(searchLower)
        ) {
          if (seenUserIds.has(member.user_id)) continue;
          const company = companyByAccountId.get(member.account_id);

          matchingUsers.push({
            user_id: member.user_id,
            email,
            name,
            role: member.role,
            company_id: company?.id || null,
            company_name: company?.name || null,
            company_slug: company?.slug || null,
          });
          seenUserIds.add(member.user_id);

          if (matchingUsers.length >= limit) break;
        }
      } catch {
        // Skip users we can't fetch
        continue;
      }
    }

    return NextResponse.json({ users: matchingUsers });
  } catch (error: any) {
    console.error("[Admin Users Search] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search users" },
      { status: 500 }
    );
  }
}
