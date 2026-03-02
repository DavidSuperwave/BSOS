import mammoth from "mammoth";

export interface AnalyzedDocument {
  document_type: "case_study" | "playbook" | "sop" | "brand_guide" | "other";
  title: string;
  summary: string;
  key_points: string[];
  entities: { companies: string[]; people: string[]; products: string[] };
  extracted_insights: { category: string; insight: string; confidence: number }[];
}

function inferType(text: string, fileName: string): AnalyzedDocument["document_type"] {
  const corpus = `${fileName}\n${text}`.toLowerCase();
  if (corpus.includes("case study") || corpus.includes("customer story")) return "case_study";
  if (corpus.includes("playbook")) return "playbook";
  if (corpus.includes("standard operating procedure") || corpus.includes("sop")) return "sop";
  if (corpus.includes("brand guide") || corpus.includes("brand voice")) return "brand_guide";
  return "other";
}

function extractTitle(text: string, fileName: string): string {
  const firstLine = (text || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || fileName.replace(/\.[^.]+$/, "");
}

function summarize(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 400);
}

function extractKeyPoints(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines.filter((line) => /^[-*]\s+/.test(line)).slice(0, 6);
  if (bullets.length > 0) {
    return bullets.map((b) => b.replace(/^[-*]\s+/, "").slice(0, 160));
  }
  return lines.slice(0, 6).map((line) => line.slice(0, 160));
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list.map((v) => v.trim()).filter(Boolean))).slice(0, 10);
}

function extractEntities(text: string) {
  const companyMatches = text.match(/\b[A-Z][A-Za-z0-9&.-]+\s(?:Inc|LLC|Ltd|Corp|Technologies|Systems)\b/g) || [];
  const peopleMatches = text.match(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g) || [];
  const productMatches = text.match(/\b[A-Z][A-Za-z0-9]+\s(?:Platform|Suite|Cloud|API)\b/g) || [];
  return {
    companies: dedupe(companyMatches),
    people: dedupe(peopleMatches),
    products: dedupe(productMatches),
  };
}

function extractInsights(type: AnalyzedDocument["document_type"], text: string) {
  const insights: Array<{ category: string; insight: string; confidence: number }> = [];
  if (type === "case_study") {
    insights.push({
      category: "social_proof",
      insight: "Document appears to contain customer outcome evidence useful for outbound messaging.",
      confidence: 0.82,
    });
  }
  if (/\bconversion|reply rate|open rate|pipeline|revenue\b/i.test(text)) {
    insights.push({
      category: "performance",
      insight: "Contains measurable performance language that can feed campaign baselines.",
      confidence: 0.76,
    });
  }
  if (insights.length === 0) {
    insights.push({
      category: "general",
      insight: "Contains reusable institutional knowledge for GTM operations.",
      confidence: 0.68,
    });
  }
  return insights;
}

async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (fileName.endsWith(".pdf")) {
    // Lazy-load PDF parser so deploy-agent route does not crash at module import time.
    try {
      const mod = await import("pdf-parse");
      const parser = (mod as any).default ?? mod;
      const result = await parser(buffer);
      return result?.text || "";
    } catch (error: any) {
      console.warn("[Intake] PDF parsing unavailable, falling back to empty text:", error?.message || error);
      return "";
    }
  }

  if (fileName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  return buffer.toString("utf8");
}

export async function analyzeDocument(file: File): Promise<AnalyzedDocument> {
  const text = await extractTextFromFile(file);
  const documentType = inferType(text, file.name);
  const title = extractTitle(text, file.name);
  const summary = summarize(text);
  const keyPoints = extractKeyPoints(text);
  const entities = extractEntities(text);
  const extractedInsights = extractInsights(documentType, text);

  return {
    document_type: documentType,
    title,
    summary,
    key_points: keyPoints,
    entities,
    extracted_insights: extractedInsights,
  };
}
