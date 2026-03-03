import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * Safe fields exposed to users — never expose purchase_cost, notes, or created_by.
 */
const SAFE_FIELDS =
  "id, domain_name, domain_type, sale_price, domain_age_years, health_score, tags, user_count, mailbox_count, created_at";

/**
 * GET /api/inboxing/request-domain
 * Browse available domains from the Superwave pool.
 * Users can only see domains with status='available'.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company_id");
  const domainType = searchParams.get("domain_type");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  if (!companyId) {
    return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  const admin = getAdmin();

  try {
    // Main query: available domains only
    let query = admin
      .from("domain_inventory")
      .select(SAFE_FIELDS, { count: "exact" })
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (domainType) query = query.eq("domain_type", domainType);
    if (search) query = query.ilike("domain_name", `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    // Summary counts
    const { data: eliteCount } = await admin
      .from("domain_inventory")
      .select("id", { count: "exact", head: true })
      .eq("status", "available")
      .eq("domain_type", "elite");

    const { data: standardCount } = await admin
      .from("domain_inventory")
      .select("id", { count: "exact", head: true })
      .eq("status", "available")
      .eq("domain_type", "standard");

    // Get counts from the response headers (Supabase returns count in metadata)
    const eliteAvailable = eliteCount ? (eliteCount as any).length || 0 : 0;
    const standardAvailable = standardCount ? (standardCount as any).length || 0 : 0;

    return NextResponse.json({
      domains: data || [],
      summary: {
        available_elite: eliteAvailable,
        available_standard: standardAvailable,
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    console.error("[request-domain GET]", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch available domains" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inboxing/request-domain
 * Reserve a domain from the pool (initiates checkout flow).
 * The actual Stripe checkout is handled by /api/stripe/checkout.
 * This route reserves the domain for 15 minutes and returns pricing info.
 *
 * CRON CLEANUP NOTE:
 * A scheduled job should periodically run:
 *   UPDATE domain_inventory SET status='available', assigned_to_company_id=NULL, reserved_until=NULL
 *   WHERE status='reserved' AND reserved_until < now();
 * And also:
 *   UPDATE domain_transactions SET status='failed'
 *   WHERE status='pending' AND created_at < now() - interval '15 minutes';
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      company_id,
      domain_inventory_id,
      domain_type,
      mailbox_count = 3,
    } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const accessResult = await requireCompanyAccess(company_id);
    if ("error" in accessResult) return accessResult.error;

    const admin = getAdmin();
    let domain: any = null;

    if (domain_inventory_id) {
      // User selected a specific domain
      const { data, error } = await admin
        .from("domain_inventory")
        .select("*")
        .eq("id", domain_inventory_id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });
      }

      // Check availability
      if (data.status === "reserved" && data.reserved_until && new Date(data.reserved_until) > new Date()) {
        return NextResponse.json(
          { error: "This domain is currently reserved by another user. Please try again shortly." },
          { status: 409 }
        );
      }
      if (data.status !== "available") {
        return NextResponse.json(
          { error: `Domain is not available (current status: ${data.status})` },
          { status: 409 }
        );
      }

      domain = data;
    } else if (domain_type) {
      // Auto-select first available domain of this type (oldest first = FIFO)
      const { data, error } = await admin
        .from("domain_inventory")
        .select("*")
        .eq("status", "available")
        .eq("domain_type", domain_type)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: `No ${domain_type} domains available. Contact support or check back later.` },
          { status: 404 }
        );
      }

      domain = data;
    } else {
      return NextResponse.json(
        { error: "Either domain_inventory_id or domain_type is required" },
        { status: 400 }
      );
    }

    // Reserve the domain (15 minute hold)
    const reservedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: updateError } = await admin
      .from("domain_inventory")
      .update({
        status: "reserved",
        assigned_to_company_id: company_id,
        reserved_until: reservedUntil,
      })
      .eq("id", domain.id)
      .eq("status", "available"); // Optimistic lock — only reserve if still available

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to reserve domain. It may have been claimed by someone else." },
        { status: 409 }
      );
    }

    // Create pending transaction
    const salePrice = parseFloat(domain.sale_price || "0");
    const monthlyMailboxCost = mailbox_count * 10;

    const { data: transaction, error: txError } = await admin
      .from("domain_transactions")
      .insert({
        company_id,
        domain_inventory_id: domain.id,
        type: "purchase",
        status: "pending",
        amount_paid: salePrice,
        metadata: {
          mailbox_count,
          reserved_until: reservedUntil,
          domain_name: domain.domain_name,
          domain_type: domain.domain_type,
        },
      })
      .select("id")
      .single();

    if (txError) {
      // Rollback reservation
      await admin
        .from("domain_inventory")
        .update({ status: "available", assigned_to_company_id: null, reserved_until: null })
        .eq("id", domain.id);

      throw txError;
    }

    return NextResponse.json({
      domain: {
        id: domain.id,
        domain_name: domain.domain_name,
        domain_type: domain.domain_type,
        sale_price: salePrice,
        domain_age_years: domain.domain_age_years,
        user_count: domain.user_count,
      },
      transaction_id: transaction.id,
      mailbox_count,
      pricing: {
        domain_cost: salePrice,
        monthly_mailbox_cost: monthlyMailboxCost,
        total_first_month: salePrice + monthlyMailboxCost,
      },
      reserved_until: reservedUntil,
    });
  } catch (err: any) {
    console.error("[request-domain POST]", err);
    return NextResponse.json(
      { error: err.message || "Failed to reserve domain" },
      { status: 500 }
    );
  }
}
