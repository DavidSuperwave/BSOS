import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export interface AgentAuthResult {
  companyId: string;
  agentId: string;
}

/**
 * Validate an agent request by checking the X-Agent-Token header
 * against companies.agent_config.token.
 *
 * Returns the companyId and agentId on success, or null on failure.
 */
export async function validateAgentRequest(
  req: NextRequest
): Promise<AgentAuthResult | null> {
  const token = req.headers.get("x-agent-token");
  if (!token) return null;

  const admin = getAdmin();

  // Find a company whose agent_config.token matches
  const { data, error } = await admin
    .from("companies")
    .select("id, agent_config")
    .eq("agent_status", "active")
    .not("agent_config", "is", null);

  if (error || !data) return null;

  for (const company of data) {
    if (company.agent_config?.token === token) {
      return {
        companyId: company.id,
        agentId: company.agent_config.agent_id,
      };
    }
  }

  return null;
}
