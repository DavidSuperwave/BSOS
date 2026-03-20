import { createClient } from "@supabase/supabase-js";
import { BsosSupermemoryClient } from "./client";

export interface BatchSyncItem {
  content: string;
  containerTag: string;
  customId: string;
  metadata: Record<string, string | number | boolean>;
}

export interface BatchSyncResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ customId: string; error: string }>;
}

export async function batchSyncToSupermemory(params: {
  items: BatchSyncItem[];
  companyId: string;
  integrationName: string;
  supermemoryClient: BsosSupermemoryClient;
  supabase: ReturnType<typeof createClient>;
  chunkSize?: number;
  delayMs?: number;
}): Promise<BatchSyncResult> {
  const chunkSize = params.chunkSize || 50;
  const delayMs = params.delayMs || 1500;
  const results: BatchSyncResult = {
    total: params.items.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < params.items.length; i += chunkSize) {
    const chunk = params.items.slice(i, i + chunkSize);

    try {
      await params.supermemoryClient.batchAdd({
        documents: chunk.map((item) => ({
          content: item.content,
          containerTag: item.containerTag,
          customId: item.customId,
          metadata: item.metadata,
        })),
      });
      results.succeeded += chunk.length;
    } catch (error: any) {
      try {
        for (const item of chunk) {
          try {
            await params.supermemoryClient.addDocument({
              content: item.content,
              containerTag: item.containerTag,
              customId: item.customId,
              metadata: item.metadata,
            });
            results.succeeded += 1;
          } catch (itemError: any) {
            results.failed += 1;
            results.errors.push({
              customId: item.customId,
              error: itemError?.message || "Unknown error",
            });
          }
        }
      } catch (fallbackError: any) {
        results.failed += chunk.length;
        results.errors.push({
          customId: chunk[0]?.customId || "batch",
          error: fallbackError?.message || error?.message || "Unknown batch error",
        });
      }
    }

    if (i + chunkSize < params.items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (results.failed > 0) {
    await params.supabase.from("admin_alerts").insert({
      company_id: params.companyId,
      severity: results.failed > 10 ? "critical" : "warning",
      alert_type: "supermemory_batch_sync_failure",
      message: `${results.failed}/${results.total} items failed during ${params.integrationName} batch sync`,
      details: {
        integration: params.integrationName,
        total: results.total,
        succeeded: results.succeeded,
        failed: results.failed,
        errors: results.errors.slice(0, 20),
      },
      is_resolved: false,
    });
  }

  return results;
}
