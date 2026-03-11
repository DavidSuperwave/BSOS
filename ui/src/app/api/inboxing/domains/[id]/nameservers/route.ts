import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as inboxing from "@/lib/inboxing-client";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  const { data: domain, error } = await admin
    .from("inboxing_domains")
    .select("id, company_id, inboxing_id, nameservers")
    .eq("id", id)
    .single();

  if (error || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const accessResult = await requireCompanyAccess(domain.company_id);
  if ("error" in accessResult) return accessResult.error;

  let nameservers = (domain.nameservers || []) as string[];
  if (domain.inboxing_id) {
    try {
      const status = await inboxing.getDomainStatus(domain.inboxing_id, { usePlatformKey: true });
      if (Array.isArray(status.nameservers)) {
        nameservers = status.nameservers;
        await admin
          .from("inboxing_domains")
          .update({ nameservers })
          .eq("id", id);
      }
    } catch (err) {
      console.warn("[Inboxing] nameserver sync failed", err);
    }
  }

  return NextResponse.json({ nameservers });
}
