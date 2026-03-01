import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { analyzeDocument } from "@/lib/intake/document-analyzer";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const analysis = await analyzeDocument(file);
    return NextResponse.json(analysis);
  } catch (err: any) {
    console.error("[Documents/Analyze]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to analyze document" },
      { status: 500 }
    );
  }
}
