import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * POST /api/cron/cleanup-reservations
 * 
 * Runs periodically (every 5-10 minutes via Vercel cron) to:
 * 1. Release expired domain reservations back to the pool
 * 2. Mark stale pending transactions as failed
 * 
 * Protected by CRON_SECRET header verification.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  const now = new Date().toISOString();
  const results = { released_domains: 0, failed_transactions: 0, errors: [] as string[] };

  try {
    // 1. Release expired reservations
    // Domains with status='reserved' and reserved_until < now()
    const { data: expiredDomains, error: fetchError } = await admin
      .from("domain_inventory")
      .select("id, domain_name, assigned_to_company_id")
      .eq("status", "reserved")
      .lt("reserved_until", now);

    if (fetchError) {
      results.errors.push(`Failed to fetch expired reservations: ${fetchError.message}`);
    } else if (expiredDomains && expiredDomains.length > 0) {
      const expiredIds = expiredDomains.map((d) => d.id);

      const { error: updateError, count } = await admin
        .from("domain_inventory")
        .update({
          status: "available",
          assigned_to_company_id: null,
          reserved_until: null,
          updated_at: now,
        })
        .in("id", expiredIds);

      if (updateError) {
        results.errors.push(`Failed to release domains: ${updateError.message}`);
      } else {
        results.released_domains = count || expiredDomains.length;
        console.log(
          `[cron/cleanup] Released ${results.released_domains} expired reservations:`,
          expiredDomains.map((d) => d.domain_name)
        );
      }
    }

    // 2. Mark stale pending transactions as failed
    // Transactions with status='pending' older than 20 minutes (buffer beyond 15min hold)
    const staleThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const { error: txError, count: txCount } = await admin
      .from("domain_transactions")
      .update({
        status: "failed",
        metadata: { failure_reason: "reservation_expired", cleaned_at: now },
        updated_at: now,
      })
      .eq("status", "pending")
      .lt("created_at", staleThreshold);

    if (txError) {
      results.errors.push(`Failed to clean transactions: ${txError.message}`);
    } else {
      results.failed_transactions = txCount || 0;
    }

    console.log("[cron/cleanup] Completed:", results);

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: now,
    });
  } catch (err: any) {
    console.error("[cron/cleanup] Error:", err);
    return NextResponse.json(
      { error: err.message || "Cleanup failed", ...results },
      { status: 500 }
    );
  }
}
