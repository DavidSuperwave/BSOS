"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCompany } from "@/contexts/company-context";
import { useStreamingChat } from "@/lib/hooks/use-streaming-chat";
import { useDashboardMetrics, useCampaigns, useChatSessions, useSupermemoryDocuments } from "@/lib/hooks";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { SessionSidebar } from "@/components/chat/session-sidebar";
import { GeneratedArtifactViewer } from "@/components/chat/generated-artifact-viewer";
import type { GeneratedArtifactSelection } from "@/components/chat/generated-artifact-types";
import { Sparkles } from "lucide-react";

export default function ChatPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"Chat" | "Research">("Chat");
  const [selectedArtifact, setSelectedArtifact] = useState<GeneratedArtifactSelection | null>(
    null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
    loadSession,
    currentSessionId,
  } = useStreamingChat({
    companyId: companyId || "",
    sessionType: "main",
    onError: (error) => setSessionError(error.message),
  });

  const { data: sessionsData, isLoading: sessionsLoading, mutate: refreshSessions } = useChatSessions(
    companyId,
    "main"
  );
  const { data: vaultData, isLoading: vaultLoading } = useSupermemoryDocuments(companyId, "all");
  const { data: metrics } = useDashboardMetrics(companyId);
  const { data: campaignsData } = useCampaigns(companyId);
  const sessions = sessionsData?.sessions || [];
  const campaigns = useMemo(() => campaignsData?.campaigns || [], [campaignsData?.campaigns]);
  const vaultDocuments = useMemo(() => {
    const docs = vaultData?.documents || [];
    return docs
      .map((doc) => {
        const firstLine = (doc.content || doc.raw || "")
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean);
        const title =
          doc.title?.trim() ||
          (typeof doc.metadata?.title === "string" ? doc.metadata.title.trim() : "") ||
          (firstLine ? firstLine.replace(/^#+\s*/, "").slice(0, 72) : "") ||
          "Untitled document";
        return {
          id: doc.id,
          title,
          updatedAt: doc.updatedAt || doc.createdAt || undefined,
        };
      })
      .filter((doc) => doc.id)
      .slice(0, 80);
  }, [vaultData?.documents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (
      content: string,
      options?: { referencedDocs?: Array<{ id: string; title: string }> }
    ) => {
      setSessionError(null);
      const references = options?.referencedDocs || [];
      const componentContext =
        references.length > 0
          ? {
              component: "chat",
              data: {
                vaultReferences: references.map((doc) => ({
                  id: doc.id,
                  title: doc.title,
                })),
              },
            }
          : undefined;
      await sendMessage(content, componentContext);
      void refreshSessions();
    },
    [sendMessage, refreshSessions]
  );

  const handleSessionClick = useCallback(
    async (sessionId: string) => {
      setSessionError(null);
      setSelectedArtifact(null);
      try {
        await loadSession(sessionId);
      } catch {
        // Error already surfaced through hook onError callback.
      }
    },
    [loadSession]
  );

  const handleNewChat = useCallback(() => {
    setSessionError(null);
    setSelectedArtifact(null);
    clearMessages();
  }, [clearMessages]);

  const mentionChips = useMemo(() => {
    const toChipLabel = (value: string, prefix: string) => {
      const trimmed = value.trim();
      const short = trimmed.length > 26 ? `${trimmed.slice(0, 26)}…` : trimmed;
      return `${prefix}: ${short}`;
    };
    const labels: string[] = [];
    const activeCampaign = campaigns.find(
      (campaign) => campaign.status?.toLowerCase() === "active" || campaign.status?.toLowerCase() === "running"
    );
    const pausedCampaign = campaigns.find((campaign) => campaign.status?.toLowerCase() === "paused");

    if (activeCampaign) {
      labels.push(toChipLabel(activeCampaign.name, "Active"));
    }

    if (pausedCampaign) {
      labels.push(toChipLabel(pausedCampaign.name, "Paused"));
    }

    if ((metrics?.totalReplies || 0) > 0) {
      labels.push(`Review ${metrics?.totalReplies ?? 0} replies`);
    }

    if ((metrics?.meetingsBooked || 0) === 0 && (metrics?.positiveReplies || 0) > 0) {
      labels.push("Book more meetings");
    }

    for (const fallback of ["Research ICP", "Optimize Outreach", "Plan GTM"]) {
      if (labels.length >= 2) break;
      if (!labels.includes(fallback)) {
        labels.push(fallback);
      }
    }

    return labels.slice(0, 2);
  }, [campaigns, metrics?.meetingsBooked, metrics?.positiveReplies, metrics?.totalReplies]);


  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setSessionError(null);
      try {
        const response = await fetch(
          `/api/chat/sessions?id=${encodeURIComponent(sessionId)}&hard=true`,
          { method: "DELETE" }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Failed to delete session");
        }
        if (currentSessionId === sessionId) {
          clearMessages();
        }
        await refreshSessions();
      } catch (error: any) {
        setSessionError(error?.message || "Failed to delete chat session");
      }
    },
    [clearMessages, currentSessionId, refreshSessions]
  );

  if (!companyId) {
    return (
      <AppShell
        header={{
          title: "Julian",
          subtitle: "Your GTM AI Agent",
        }}
        hideHeader
      >
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          Select a company to start chatting.
        </div>
      </AppShell>
    );
  }

  const hasMessages = messages.length > 0;
  const rightRailWidthClass = selectedArtifact ? "w-[34rem]" : "w-80";

  return (
    <AppShell
      header={{
        title: "Julian",
        subtitle: "Your GTM AI Agent",
      }}
      hideHeader
    >
      <div className="flex h-full bg-[#f4f6fb] text-[#1f2430]">
        <div className="flex min-w-0 flex-1 flex-col">
          {!hasMessages ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
              <div className="w-full max-w-4xl">
                <div className="mb-6 text-center">
                  <h1 className="inline-flex items-center gap-2 text-4xl font-semibold tracking-tight text-[#1f2430]">
                    <Sparkles className="h-7 w-7 text-[#d27d53]" />
                    Back at it, Julian
                  </h1>
                  <p className="mt-2 text-sm text-[#697185]">
                    Ask about campaigns, inbox, CRM, or your vault documents.
                  </p>
                </div>
                <ChatInput
                  onSend={(message, options) => void handleSend(message, options)}
                  isProcessing={isStreaming}
                  showSuggestions={false}
                  variant="modern"
                  mentionChips={mentionChips}
                  modeLabel={chatMode}
                  onModeChange={setChatMode}
                  vaultDocuments={vaultDocuments}
                  vaultLoading={vaultLoading}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      variant="modern"
                      message={{
                        id: message.id,
                        role: message.role,
                        content: message.content,
                        timestamp: message.timestamp,
                        isThinking: message.isStreaming,
                        toolCalls: message.toolCalls,
                        tasks: message.tasks as any,
                        reasoning: message.reasoning,
                        reasoningDuration: message.reasoningDuration,
                      }}
                      onOpenArtifact={setSelectedArtifact}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>
              <div className="bg-transparent px-4 pb-4 pt-2">
                <div className="mx-auto w-full max-w-2xl">
                  <ChatInput
                    onSend={(message, options) => void handleSend(message, options)}
                    isProcessing={isStreaming}
                    showSuggestions={false}
                    variant="modern"
                    compact
                    placeholder="Ask a follow-up"
                    mentionChips={mentionChips}
                    modeLabel={chatMode}
                    onModeChange={setChatMode}
                    vaultDocuments={vaultDocuments}
                    vaultLoading={vaultLoading}
                  />
                </div>
              </div>
            </>
          )}

          {sessionError ? (
            <div className="border-t border-red-300/60 bg-red-50 px-4 py-2 text-sm text-red-700">
              {sessionError}
            </div>
          ) : null}
        </div>

        <div
          className={`hidden shrink-0 border-l border-[#e0e5ef] bg-white transition-[width] duration-200 lg:block ${rightRailWidthClass}`}
        >
          {selectedArtifact ? (
            <GeneratedArtifactViewer
              artifact={selectedArtifact}
              onClose={() => setSelectedArtifact(null)}
            />
          ) : (
            <SessionSidebar
              sessions={sessions}
              activeSessionId={currentSessionId}
              onSessionClick={(id) => void handleSessionClick(id)}
              onNewChat={handleNewChat}
              onDeleteSession={(id) => void handleDeleteSession(id)}
              isLoading={sessionsLoading}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
