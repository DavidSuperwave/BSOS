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

export async function GET(_request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const admin = getAdmin();

    const { data: viewData, error: statsError } = await admin
      .from("domain_inventory_stats")
      .select("*")
      .single();

    if (statsError) {
      return NextResponse.json({ error: statsError.message }, { status: 500 });
    }

    const { data: recurringData, error: recurringError } = await admin
      .from("mailbox_subscriptions")
      .select("monthly_price")
      .eq("status", "active");

    if (recurringError) {
      return NextResponse.json({ error: recurringError.message }, { status: 500 });
    }

    const monthlyRecurring = (recurringData ?? []).reduce((sum, row) => {
      const value = typeof row.monthly_price === "number" ? row.monthly_price : Number(row.monthly_price || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const { count: totalTransactions, error: txCountError } = await admin
      .from("domain_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");

    if (txCountError) {
      return NextResponse.json({ error: txCountError.message }, { status: 500 });
    }

    const { data: recentTransactions, error: recentError } = await admin
      .from("domain_transactions")
      .select(
        `
          id,
          company_id,
          domain_inventory_id,
          amount_paid,
          currency,
          type,
          status,
          created_at,
          companies:company_id (
            id,
            name
          )
        `
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentError) {
      return NextResponse.json({ error: recentError.message }, { status: 500 });
    }

    return NextResponse.json({
      stats: {
        ...(viewData ?? {}),
        monthly_recurring: monthlyRecurring,
        total_transactions: totalTransactions ?? 0,
      },
      recent_transactions: recentTransactions ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch domain stats" },
      { status: 500 }
    );
  }
}
