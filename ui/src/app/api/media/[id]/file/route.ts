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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  const redirect = req.nextUrl.searchParams.get("redirect") === "true";
  const expiresIn = Number(req.nextUrl.searchParams.get("expiresIn") || 3600);

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    const { data: media, error } = await admin
      .from("media_files")
      .select("id, storage_path")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (error || !media?.storage_path) {
      return NextResponse.json({ error: "Media file not found" }, { status: 404 });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("media")
      .createSignedUrl(media.storage_path, Math.min(Math.max(expiresIn, 60), 60 * 60 * 24));
    if (signedError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signedError?.message || "Failed to create signed URL" },
        { status: 500 }
      );
    }

    if (redirect) {
      return NextResponse.redirect(signed.signedUrl, { status: 302 });
    }

    return NextResponse.json({ signedUrl: signed.signedUrl });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch media file URL" },
      { status: 500 }
    );
  }
}
