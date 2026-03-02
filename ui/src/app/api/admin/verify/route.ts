import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { verifyAdminAccess, isAdminEmail } from "@/lib/bsos/db";

/**
 * POST /api/admin/verify
 * Verify that the current user has admin access.
 */
export async function POST() {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check admin email list
  if (!isAdminEmail(auth.email)) {
    return NextResponse.json({ error: "Not an admin email" }, { status: 403 });
  }

  // Also verify DB-level access
  const hasAccess = await verifyAdminAccess(auth.userId);
  if (!hasAccess) {
    return NextResponse.json({ error: "No admin role found" }, { status: 403 });
  }

  return NextResponse.json({ authorized: true, email: auth.email });
}
