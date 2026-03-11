import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { BsosSupermemoryClient } from "@/lib/supermemory/client";
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

async function resolveSupermemoryKey(companyId: string): Promise<string | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", companyId)
    .single();

  return (
    data?.integration_credentials?.supermemory_api_key ||
    envConfig.supermemory.apiKey() ||
    null
  );
}

export async function search_company_knowledge(params: {
  companyId: string;
  query: string;
  projectId?: string;
  primaryTag?: string;
}) {
  const admin = getAdmin();
  const projectId =
    params.projectId ||
    (await admin
      .from("knowledge_projects")
      .select("id")
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .then((r) => r.data?.[0]?.id));

  if (!projectId) return { results: [], total: 0 };

  const containerTag = await getProjectContainerTag(projectId);
  const apiKey = await resolveSupermemoryKey(params.companyId);
  if (!containerTag || !apiKey) return { results: [], total: 0 };

  return BsosSupermemoryClient.getInstance(apiKey).searchDocuments({
    q: params.query,
    containerTags: [containerTag],
    filters: params.primaryTag ? { primaryTag: params.primaryTag } : undefined,
    limit: 10,
  });
}

export async function get_campaign_details(campaignId: string) {
  const admin = getAdmin();
  const { data } = await admin
    .from("inbox_messages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

export async function get_lead_context(leadId: string) {
  const admin = getAdmin();
  const { data } = await admin
    .from("pipeline_entries")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  return data;
}

export async function list_recent_insights(params: {
  companyId: string;
  projectId?: string;
  category?: string;
  limit?: number;
}) {
  return search_company_knowledge({
    companyId: params.companyId,
    query: params.category || "insight",
    projectId: params.projectId,
    primaryTag: "analysis",
  }).then((r) => r.results.slice(0, params.limit || 10));
}

