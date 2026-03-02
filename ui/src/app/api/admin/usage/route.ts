import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { verifyAdminAccess, getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/admin/usage
 * Get all users with their account info. Admin only.
 */
export async function GET() {
  const auth = await authenticateUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await verifyAdminAccess(auth.userId);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminClient();

  const { data: members, error } = await db
    .from("account_members")
    .select("user_id, role, account_id, created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with user emails
  const users = [];
  for (const member of (members || [])) {
    try {
      const { data: userData } = await db.auth.admin.getUserById(member.user_id);
      // Get company name
      const { data: companies } = await db
        .from("companies")
        .select("name")
        .eq("account_id", member.account_id)
        .limit(1);

      users.push({
        user_id: member.user_id,
        email: userData?.user?.email || "unknown",
        role: member.role,
        company_name: companies?.[0]?.name || "—",
        created_at: member.created_at,
      });
    } catch {
      users.push({
        user_id: member.user_id,
        email: "unknown",
        role: member.role,
        company_name: "—",
        created_at: member.created_at,
      });
    }
  }

  return NextResponse.json({ users, count: users.length });
}
