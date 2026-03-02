import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { classifyReply, computeReplyQuality } from "@/lib/bsos/reply-classifier";

/**
 * POST /api/bsos/replies/classify
 * Classify a reply or batch of replies.
 * Body: { reply_text: string } or { replies: string[] }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.reply_text) {
    const result = await classifyReply(body.reply_text);
    return NextResponse.json(result);
  }

  if (body.replies && Array.isArray(body.replies)) {
    const classified = await Promise.all(
      body.replies.map(async (text: string) => {
        const result = await classifyReply(text);
        return { text: text.substring(0, 100), ...result };
      })
    );
    const quality = computeReplyQuality(
      classified.map((c: any) => ({ classification: c.classification }))
    );
    return NextResponse.json({ classified, quality });
  }

  return NextResponse.json({ error: "Provide reply_text or replies[]" }, { status: 400 });
}
