import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export interface ExecutionStep {
  name: string;
  status: "started" | "completed" | "failed";
  started_at?: string;
  completed_at?: string;
  detail?: string;
}

export interface SkillExecution {
  id: string;
  company_id: string;
  skill_id: string;
  agent_type: string;
  context_id?: string;
  session_key: string;
  input_refs: Record<string, string>;
  input_params: Record<string, any>;
  steps: ExecutionStep[];
  output_summary: string;
  output_insight_ids: string[];
  tokens_used: number;
  duration_ms: number;
  created_at: string;
}

function buildTraceId(executionId: string): string {
  return crypto.createHash("sha256").update(executionId).digest("hex").slice(0, 24);
}

export async function logSkillExecution(input: {
  companyId: string;
  skillId: string;
  agentType: string;
  contextId?: string;
  sessionKey: string;
  inputRefs?: Record<string, string>;
  inputParams?: Record<string, any>;
  steps?: ExecutionStep[];
  outputSummary?: string;
  outputInsightIds?: string[];
  tokensUsed?: number;
  durationMs?: number;
}): Promise<{ success: boolean; executionId?: string; traceId?: string }> {
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("skill_executions")
      .insert({
        company_id: input.companyId,
        skill_id: input.skillId,
        agent_type: input.agentType,
        context_id: input.contextId || null,
        session_key: input.sessionKey,
        input_refs: input.inputRefs || {},
        input_params: input.inputParams || {},
        steps: input.steps || [],
        output_summary: input.outputSummary || "",
        output_insight_ids: input.outputInsightIds || [],
        tokens_used: input.tokensUsed || 0,
        duration_ms: input.durationMs || 0,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("[SkillsExecutionLogger] insert failed:", error);
      return { success: false };
    }

    const executionId = data.id as string;
    const traceId = buildTraceId(executionId);
    await admin.from("skill_executions").update({ trace_id: traceId }).eq("id", executionId);
    return { success: true, executionId, traceId };
  } catch (error) {
    console.error("[SkillsExecutionLogger] error:", error);
    return { success: false };
  }
}
