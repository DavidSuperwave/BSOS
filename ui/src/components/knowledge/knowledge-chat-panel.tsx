"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStreamingChat } from "@/lib/hooks/use-streaming-chat";
import type { SupermemoryDocument } from "@/lib/hooks";
import { ChatMessage } from "@/components/chat/chat-message";

interface KnowledgeChatPanelProps {
  companyId?: string;
  document: SupermemoryDocument | null;
}

function resolveDocumentTitle(document: SupermemoryDocument | null): string {
  if (!document) return "Document";
  const resolvedContent = document.content || document.raw || "";
  return (
    document.title ||
    document.metadata?.title ||
    resolvedContent.split("\n")[0]?.replace(/^#+\s*/, "") ||
    "Untitled"
  );
}

function resolveDocumentContent(document: SupermemoryDocument | null): string {
  if (!document) return "";
  return document.content || document.raw || "";
}

function resolveDocumentFolder(document: SupermemoryDocument | null): string {
  if (!document) return "Unfiled";
  const fromMetadata =
    typeof document.metadata?.folder === "string" ? document.metadata.folder : null;
  const fromCategory =
    typeof document.metadata?.category === "string" ? document.metadata.category : null;
  const value = (fromMetadata || fromCategory || "Unfiled").trim();
  return value || "Unfiled";
}

export function KnowledgeChatPanel({ companyId, document }: KnowledgeChatPanelProps) {
  const [draft, setDraft] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const title = resolveDocumentTitle(document);
  const folder = resolveDocumentFolder(document);
  const content = resolveDocumentContent(document);
  const contentPreview = content.slice(0, 1200);

  const { messages, isStreaming, sendMessage, clearMessages } = useStreamingChat({
    companyId: companyId || "",
    sessionType: "main",
  });

  const suggestions = useMemo(
    () => [
      `Summarize "${title}" in 3 bullets`,
      "What are the key action items from this document?",
      "Rewrite this document as an executive update",
    ],
    [title]
  );

  useEffect(() => {
    clearMessages();
    setDraft("");
    // clear history whenever the selected document changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id]);

  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, isStreaming]);

  const handleSend = async (prompt?: string) => {
    if (!companyId || !document) return;
    const contentToSend = (prompt ?? draft).trim();
    if (!contentToSend || isStreaming) return;

    const context = {
      component: "knowledge",
      data: {
        documentId: document.id,
        title,
        folder,
        containerTag: document.containerTag || document.containerTags?.[0] || null,
        contentPreview,
      },
    };

    await sendMessage(contentToSend, context);
    if (!prompt) setDraft("");
  };

  if (!document) {
    return (
      <div className="glass-card flex h-full flex-col items-center justify-center rounded-xl border border-border p-6 text-center">
        <Bot className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select a document to chat with Julian about its content.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card flex h-full min-h-0 flex-col rounded-xl border border-border">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground truncate">Chat: {title}</p>
        <p className="text-xs text-muted-foreground">Folder: {folder}</p>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => void handleSend(suggestion)}
            disabled={isStreaming || !companyId}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{suggestion}</span>
          </button>
        ))}
      </div>

      <div ref={viewportRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask about this document to begin.</p>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={{
                id: message.id,
                role: message.role,
                content: message.content || (message.isStreaming ? "Thinking..." : ""),
                timestamp: message.timestamp,
                isThinking: message.isStreaming,
                toolCalls: message.toolCalls,
                tasks: (message as any).tasks,
                reasoning: message.reasoning,
                reasoningDuration: message.reasoningDuration,
              }}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!companyId || isStreaming}
            placeholder={`Ask about ${title}...`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void handleSend()}
            disabled={!companyId || isStreaming || !draft.trim()}
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
