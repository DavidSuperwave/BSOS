import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { searchDocuments, getDocument } from "@/lib/supermemory/storage";
import { projectContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

async function getProjectContainerTag(projectId: string): Promise<string | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("knowledge_projects")
    .select("container_tag_suffix, companies!inner(slug)")
    .eq("id", projectId)
    .single();

  if (!data) return null;
  const companySlug = (data.companies as any)?.slug;
  if (!companySlug) return null;
  return projectContainerTag(companySlug, data.container_tag_suffix);
}

async function resolveDefaultProject(companyId: string): Promise<string | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("knowledge_projects")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

export async function recallWithTrace(
  query: string,
  companyId: string,
  projectId?: string
): Promise<{
  insight: any | null;
  trace: any | null;
  sources: any[];
}> {
  const admin = getAdmin();
  const chosenProjectId = projectId || (await resolveDefaultProject(companyId));
  if (!chosenProjectId) {
    return { insight: null, trace: null, sources: [] };
  }

  const containerTag = await getProjectContainerTag(chosenProjectId);
  if (!containerTag) {
    return { insight: null, trace: null, sources: [] };
  }

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", companyId)
    .single();

  const apiKey =
    company?.integration_credentials?.supermemory_api_key ||
    envConfig.supermemory.apiKey();
  if (!apiKey) {
    return { insight: null, trace: null, sources: [] };
  }

  const insights = await searchDocuments(apiKey, {
    query,
    containerTags: [containerTag],
    filters: {
      primaryTag: "analysis",
    },
    limit: 5,
  });

  const insight = insights.results[0] || null;
  if (!insight) {
    return { insight: null, trace: null, sources: [] };
  }

  const executionId = insight.metadata?.execution_id;
  let trace = null;
  if (executionId) {
    const { data: row } = await admin
      .from("skill_executions")
      .select("*")
      .eq("id", executionId)
      .maybeSingle();
    trace = row || null;
  }

  const sourceIds = insight.metadata?.relationships?.derived_from || [];
  const sources: any[] = [];
  for (const sourceId of sourceIds) {
    const source = await getDocument(apiKey, sourceId);
    if (source) sources.push(source);
  }

  return { insight, trace, sources };
}
