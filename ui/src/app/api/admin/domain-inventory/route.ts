import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import * as inboxing from "@/lib/inboxing-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

type DomainType = "elite" | "standard" | "byo";

interface AddDomainInput {
  domain_name: string;
  domain_type: DomainType;
  purchase_cost?: number;
  sale_price?: number;
  user_count?: number;
  tags?: string[];
  notes?: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const admin = getAdmin();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const domainType = searchParams.get("domain_type");
    const search = searchParams.get("search");
    const assignedTo = searchParams.get("assigned_to");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = admin
      .from("domain_inventory")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) query = query.eq("status", status);
    if (domainType) query = query.eq("domain_type", domainType);
    if (assignedTo) query = query.eq("assigned_to_company_id", assignedTo);
    if (search) query = query.ilike("domain_name", `%${search}%`);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const pages = total === 0 ? 0 : Math.ceil(total / limit);

    return NextResponse.json({
      domains: data ?? [],
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch domain inventory" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const domains = Array.isArray(body?.domains) ? (body.domains as AddDomainInput[]) : [];
    const provisionViaInboxing = Boolean(body?.provision_via_inboxing);

    if (domains.length === 0) {
      return NextResponse.json({ error: "At least one domain is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const results: Array<{ domain_name: string; status: string; id?: string; inboxing_id?: string; error?: string }> = [];

    for (const rawDomain of domains) {
      const domainName = rawDomain.domain_name?.trim().toLowerCase();

      if (!domainName || !rawDomain.domain_type) {
        results.push({ domain_name: rawDomain.domain_name || "", status: "failed", error: "domain_name and domain_type are required" });
        continue;
      }

      let inboxingId: string | null = null;
      let inboxingStatus: string | null = null;

      if (provisionViaInboxing) {
        try {
          const names = Array.isArray(body?.names) && body.names.length > 0
            ? body.names
            : [{ first_name: "Sales", last_name: "Team" }];
          const inboxingRes = await inboxing.createDomain(
            {
              domain: domainName,
              names,
              user_count: (rawDomain.user_count === 25 ? 25 : 49) as 25 | 49,
            },
            { usePlatformKey: true }
          );

          inboxingId = inboxingRes?.id ? String(inboxingRes.id) : null;
          inboxingStatus = inboxingRes?.status ? String(inboxingRes.status) : null;
        } catch (inboxingError) {
          results.push({
            domain_name: domainName,
            status: "failed",
            error: inboxingError instanceof Error ? inboxingError.message : "Failed to provision in inboxing",
          });
          continue;
        }
      }

      const insertPayload = {
        domain_name: domainName,
        domain_type: rawDomain.domain_type,
        purchase_cost: rawDomain.purchase_cost ?? null,
        sale_price: rawDomain.sale_price ?? null,
        user_count: rawDomain.user_count ?? null,
        tags: rawDomain.tags ?? null,
        notes: rawDomain.notes ?? null,
        status: "available",
        created_by: auth.email,
        inboxing_id: inboxingId,
        inboxing_status: inboxingStatus,
      };

      const { data, error } = await admin
        .from("domain_inventory")
        .insert(insertPayload)
        .select("id, domain_name, inboxing_id")
        .single();

      if (error) {
        results.push({ domain_name: domainName, status: "failed", error: error.message });
        continue;
      }

      results.push({
        domain_name: data.domain_name,
        status: "created",
        id: data.id,
        inboxing_id: data.inboxing_id ?? undefined,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add domains" },
      { status: 500 }
    );
  }
}
