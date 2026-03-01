import { NextRequest, NextResponse } from "next/server";
import { getCompanyCredentials } from "@/lib/company-credentials";
import { envConfig } from "@/lib/env";
import { authenticateUser } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { query, companyId } = await req.json();

  // Resolve API key: per-company if companyId provided, else global fallback
  let apiKey: string | null = null;
  if (companyId) {
    const creds = await getCompanyCredentials(companyId);
    apiKey = creds.perplexity_api_key;
  } else {
    apiKey = envConfig.perplexity.apiKey();
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Perplexity API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You are a B2B GTM research assistant. Provide concise, actionable market intelligence.",
          },
          { role: "user", content: query },
        ],
      }),
    });
    const data = await res.json();
    return NextResponse.json({
      result: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Research failed" },
      { status: 500 }
    );
  }
}
