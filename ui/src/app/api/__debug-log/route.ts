import { NextRequest, NextResponse } from "next/server";
import { appendFile } from "node:fs/promises";

export const runtime = "nodejs";

const LOG_PATH = "/opt/cursor/logs/debug.log";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    await appendFile(
      LOG_PATH,
      `${JSON.stringify({
        hypothesisId: payload?.hypothesisId ?? "unknown",
        location: payload?.location ?? "unknown",
        message: payload?.message ?? "unknown",
        data: payload?.data ?? {},
        timestamp: Date.now(),
      })}\n`
    );
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
