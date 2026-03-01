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

function inferFileType(mimeType: string): "image" | "video" | "audio" | "pdf" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return "document";
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const companyId = String(form.get("companyId") || "");
    const context = String(form.get("context") || "");
    const contextId = String(form.get("contextId") || "");

    if (!file || !companyId) {
      return NextResponse.json({ error: "file and companyId are required" }, { status: 400 });
    }

    const access = await requireCompanyAccess(companyId);
    if ("error" in access) return access.error;
    const auth = await authenticateUser();

    const admin = getAdmin();
    const fileName = safeName(file.name || "upload.bin");
    const storagePath = `${companyId}/${Date.now()}-${fileName}`;
    const mimeType = file.type || "application/octet-stream";
    const fileType = inferFileType(mimeType);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const { error: uploadError } = await admin.storage
      .from("media")
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: mediaFile, error: dbError } = await admin
      .from("media_files")
      .insert({
        company_id: companyId,
        file_name: fileName,
        file_type: fileType,
        mime_type: mimeType,
        file_size: file.size,
        storage_path: storagePath,
        thumbnail_path: null,
        metadata: {
          original_name: file.name,
        },
        uploaded_by: auth?.userId || null,
        context: context || null,
        context_id: contextId && isUuid(contextId) ? contextId : null,
      })
      .select("*")
      .single();
    if (dbError) throw dbError;

    const { data: signed } = await admin.storage
      .from("media")
      .createSignedUrl(storagePath, 60 * 60);

    return NextResponse.json({
      media: mediaFile,
      signedUrl: signed?.signedUrl || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to upload media" },
      { status: 500 }
    );
  }
}
