import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/inbox/chat
 * Legacy endpoint — redirects to the unified /api/chat with sessionType: "inbox".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID required" },
        { status: 400 }
      );
    }

    // Forward to the unified chat endpoint
    const chatUrl = new URL("/api/chat", req.nextUrl.origin);
    const chatResponse = await fetch(chatUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        message,
        companyId,
        sessionType: "inbox",
        stream: false,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      return NextResponse.json(
        { error: errorText || "Chat request failed" },
        { status: chatResponse.status }
      );
    }

    const data = await chatResponse.json();

    // Map unified chat response to legacy format
    return NextResponse.json({
      content: data.content || data.message || "",
      sql: null,
      results: null,
      suggestedReply: null,
    });
  } catch (err: any) {
    console.error("Inbox chat redirect error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process chat" },
      { status: 500 }
    );
  }
}
