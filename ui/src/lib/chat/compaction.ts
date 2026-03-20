import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { assessChatValue } from "./value-assessment";
import { BsosSupermemoryClient, type DocumentMetadata } from "@/lib/supermemory/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

interface CompactOptions {
  companyId: string;
  companySlug: string;
  projectContainerTag: string;
  sessionId: string;
  sessionKey: string;
  supermemoryApiKey?: string | null;
  maxMessages?: number;
}

function summarizeMessages(messages: Array<{ role: string; content: string }>): string {
  const window = messages.slice(0, Math.max(0, messages.length - 5));
  const preview = window
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n")
    .slice(0, 8000);
  return `Compaction summary generated at ${new Date().toISOString()}\n\n${preview}`;
}

export async function compactChatSession(options: CompactOptions): Promise<{
  success: boolean;
  compactedCount: number;
  summary?: string;
}> {
  const admin = getAdmin();
  const maxMessages = options.maxMessages || 30;

  const { data: rows, error } = await admin
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", options.sessionId)
    .order("created_at", { ascending: true });

  if (error || !rows) {
    return { success: false, compactedCount: 0 };
  }

  if (rows.length < maxMessages) {
    return { success: true, compactedCount: 0 };
  }

  const assessment = assessChatValue(
    rows.map((r) => ({ role: r.role, content: r.content || "" }))
  );

  const summary = summarizeMessages(rows);
  const keepTail = rows.slice(-5).map((r) => r.id);
  const toCompact = rows.filter((r) => !keepTail.includes(r.id));

  if (toCompact.length === 0) {
    return { success: true, compactedCount: 0, summary };
  }

  const { data: summaryMsg } = await admin
    .from("chat_messages")
    .insert({
      session_id: options.sessionId,
      role: "system",
      content: summary,
      is_compacted: false,
    })
    .select("id")
    .single();

  const summaryId = summaryMsg?.id;
  if (!summaryId) {
    return { success: false, compactedCount: 0 };
  }

  await admin
    .from("chat_messages")
    .update({
      is_compacted: true,
      compacted_into: summaryId,
    })
    .in(
      "id",
      toCompact.map((m) => m.id)
    );

  await admin
    .from("chat_sessions")
    .update({
      summary,
      summary_updated_at: new Date().toISOString(),
    })
    .eq("id", options.sessionId);

  if (assessment.recommendation !== "discard" && options.supermemoryApiKey) {
    const metadata: DocumentMetadata = {
      project_id: "default",
      company_id: options.companyId,
      tags: {
        primary: "analysis",
        secondary: ["chat_compaction", assessment.recommendation],
        stage: "approved",
      },
      relationships: {
        related_to: [options.sessionKey],
      },
      title: `Chat Compaction ${options.sessionKey}`,
      type: "chat_compaction",
      source: "agent_generated",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    await BsosSupermemoryClient.getInstance(options.supermemoryApiKey).addDocument({
      content: summary,
      containerTag: options.projectContainerTag,
      metadata,
    });
  }

  return {
    success: true,
    compactedCount: toCompact.length,
    summary,
  };
}
