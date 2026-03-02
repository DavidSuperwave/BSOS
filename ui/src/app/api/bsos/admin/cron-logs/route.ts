import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { verifyAdminAccess, getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/admin/cron-logs
 * Get recent cron execution logs. Admin only.
 */
export async function GET() {
  const auth = await authenticateUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await verifyAdminAccess(auth.userId);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminClient();
  const { data, error } = await db
    .from("bsos_cron_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data || [] });
}
