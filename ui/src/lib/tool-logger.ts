import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * Log a tool invocation to the tool_invocations table.
 * Non-blocking — errors are swallowed.
 */
export async function logInvocation(opts: {
  companyId: string;
  sessionId?: string;
  messageId?: string;
  toolName: string;
  toolTier: "open" | "provisioned" | "proxied";
  inputParams?: Record<string, any>;
  outputSummary?: string;
  status: "success" | "error" | "timeout";
  errorMessage?: string;
  durationMs?: number;
  tokensUsed?: number;
}): Promise<void> {
  try {
    const admin = getAdmin();
    await admin.from("tool_invocations").insert({
      company_id: opts.companyId,
      session_id: opts.sessionId || null,
      message_id: opts.messageId || null,
      tool_name: opts.toolName,
      tool_tier: opts.toolTier,
      input_params: opts.inputParams || null,
      output_summary: opts.outputSummary || null,
      status: opts.status,
      error_message: opts.errorMessage || null,
      duration_ms: opts.durationMs || null,
      tokens_used: opts.tokensUsed || 0,
    });
  } catch {
    // Non-blocking
  }
}
