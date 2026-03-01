import { search_company_knowledge, get_campaign_details, get_lead_context } from "@/lib/chat/tools";

export interface SkillContext {
  tools: {
    searchKnowledge: (query: string, filters?: { companyId: string; projectId?: string; primaryTag?: string }) => Promise<any>;
    getCampaign: (id: string) => Promise<any>;
    getLead: (id: string) => Promise<any>;
    querySupabase: (table: string, filters: Record<string, any>) => Promise<any>;
  };
  log: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  companyId: string;
}

export function buildSkillContext(companyId: string): SkillContext {
  return {
    companyId,
    log: {
      info: (...args: any[]) => console.log("[SkillContext]", ...args),
      warn: (...args: any[]) => console.warn("[SkillContext]", ...args),
      error: (...args: any[]) => console.error("[SkillContext]", ...args),
    },
    tools: {
      searchKnowledge: (query, filters) =>
        search_company_knowledge({
          companyId: filters?.companyId || companyId,
          query,
          projectId: filters?.projectId,
          primaryTag: filters?.primaryTag,
        }),
      getCampaign: (id: string) => get_campaign_details(id),
      getLead: (id: string) => get_lead_context(id),
      querySupabase: async () => {
        // Placeholder interface to keep skill runtime composable.
        return [];
      },
    },
  };
}

