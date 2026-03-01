export interface ChatValueAssessment {
  containsInsight: boolean;
  containsDecision: boolean;
  containsLearning: boolean;
  recommendation: "discard" | "summarize" | "full_snapshot";
}

export interface ValueMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

const INSIGHT_RE = /\b(pattern|trend|correlation|insight|signal|baseline)\b/i;
const DECISION_RE = /\b(decided|decision|will|going to|plan to|ship|roll out)\b/i;
const LEARNING_RE = /\b(learned|found that|discovered|observed|validated)\b/i;

export function assessChatValue(messages: ValueMessage[]): ChatValueAssessment {
  const allText = messages.map((m) => m.content || "").join("\n");
  const containsInsight = INSIGHT_RE.test(allText);
  const containsDecision = DECISION_RE.test(allText);
  const containsLearning = LEARNING_RE.test(allText);

  if (containsDecision || (containsInsight && containsLearning)) {
    return {
      containsInsight,
      containsDecision,
      containsLearning,
      recommendation: "full_snapshot",
    };
  }

  if (containsInsight || containsLearning) {
    return {
      containsInsight,
      containsDecision,
      containsLearning,
      recommendation: "summarize",
    };
  }

  return {
    containsInsight,
    containsDecision,
    containsLearning,
    recommendation: "discard",
  };
}
