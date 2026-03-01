import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser, requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const category = req.nextUrl.searchParams.get("category");
  const status = req.nextUrl.searchParams.get("status");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    let query = admin
      .from("documents")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (category) query = query.eq("category", category);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ documents: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyId,
      title,
      content,
      embedded_reports,
      category,
      status,
    } = body || {};

    if (!companyId || !title) {
      return NextResponse.json(
        { error: "companyId and title are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if ("error" in access) return access.error;
    const auth = await authenticateUser();

    const admin = getAdmin();
    const { data, error } = await admin
      .from("documents")
      .insert({
        company_id: companyId,
        title,
        content: content || {},
        embedded_reports: Array.isArray(embedded_reports) ? embedded_reports : [],
        category: category || "note",
        status: status || "draft",
        created_by: auth?.userId || null,
        last_edited_by: auth?.userId || null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create document" },
      { status: 500 }
    );
  }
}
