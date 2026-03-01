export interface InsightValidation {
  confidenceScore: number;
  completenessScore: number;
  caveats: string[];
  requiresReview: boolean;
}

export interface ValidationInput {
  statement: string;
  evidenceCount: number;
  sampleSize: number;
  caveats?: string[];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function validateInsight(input: ValidationInput): InsightValidation {
  const caveats = [...(input.caveats || [])];
  let confidence = 0.5;
  let completeness = 0.5;

  if (input.statement && input.statement.length >= 20) completeness += 0.15;
  if (input.evidenceCount >= 2) confidence += 0.2;
  if (input.evidenceCount >= 5) confidence += 0.1;
  if (input.sampleSize >= 30) confidence += 0.1;
  if (input.sampleSize >= 100) confidence += 0.1;

  if (input.sampleSize < 20) {
    caveats.push("Small sample size");
    confidence -= 0.15;
  }
  if (input.evidenceCount === 0) {
    caveats.push("No explicit evidence points");
    completeness -= 0.2;
  }

  confidence = clamp(confidence);
  completeness = clamp(completeness);

  return {
    confidenceScore: confidence,
    completenessScore: completeness,
    caveats,
    requiresReview: confidence < 0.9,
  };
}
