import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";

/**
 * POST /api/inboxing/domains/generate
 * AI-powered domain name generation
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, niche, keywords = [], count = 10 } = body;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const accessResult = await requireCompanyAccess(companyId);
    if ("error" in accessResult) return accessResult.error;

    if (!niche) {
      return NextResponse.json({ error: "Niche is required" }, { status: 400 });
    }

    const perplexityKey = process.env.PERPLEXITY_API_KEY;

    if (perplexityKey) {
      // Use Perplexity for creative domain generation
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${perplexityKey}`,
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "user",
              content: `Generate ${count} brandable domain names for cold email outreach in the "${niche}" niche. Keywords: ${keywords.join(", ")}.

Requirements:
- Short (2-3 words max)
- Professional sounding
- Mix of .com, .io, .co TLDs
- Avoid hyphens
- Should sound like a real business

Return ONLY a JSON array of objects with format: [{"domain": "example.com", "score": 85}]
No other text, just the JSON array.`,
            },
          ],
        }),
      });

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "[]";

      // Parse AI response
      let suggestions = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      } catch {
        suggestions = [];
      }

      return NextResponse.json({
        suggestions: suggestions.map((s: any) => ({
          domain: s.domain,
          score: s.score || 50,
          tld: s.domain.split(".").pop(),
          availability: "unknown",
        })),
        source: "ai",
      });
    }

    // Fallback: algorithmic generation
    const tlds = [".com", ".io", ".co"];
    const prefixes = keywords.length > 0 ? keywords : [niche.toLowerCase().replace(/\s+/g, "")];
    const suffixes = ["hq", "labs", "hub", "grow", "scale", "boost", "reach", "send", "mail", "flow"];

    const suggestions = [];
    for (let i = 0; i < Math.min(count, 20); i++) {
      const prefix = prefixes[i % prefixes.length];
      const suffix = suffixes[i % suffixes.length];
      const tld = tlds[i % tlds.length];
      suggestions.push({
        domain: `${prefix}${suffix}${tld}`,
        score: 70 - i * 2,
        tld: tld.replace(".", ""),
        availability: "unknown",
      });
    }

    return NextResponse.json({ suggestions, source: "algorithmic" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate domains" },
      { status: 500 }
    );
  }
}
