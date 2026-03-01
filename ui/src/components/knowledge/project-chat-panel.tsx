"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, FileText, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStreamingChat } from "@/lib/hooks/use-streaming-chat";
import { DocumentCreatedCard } from "@/components/chat/document-created-card";
import { ChatMessage } from "@/components/chat/chat-message";
import type { KnowledgeProject, ProjectDocument } from "@/lib/hooks/use-knowledge-projects";

interface ProjectChatPanelProps {
  projectId: string;
  companyId?: string;
  project?: KnowledgeProject;
  selectedDocument?: ProjectDocument | null;
  onDocumentCreated?: (documentId: string) => void;
}

export function ProjectChatPanel({
  projectId,
  companyId,
  project,
  selectedDocument,
  onDocumentCreated,
}: ProjectChatPanelProps) {
  const [draft, setDraft] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const { messages, isStreaming, sendMessage, clearMessages } = useStreamingChat({
    companyId: companyId || "",
    sessionType: "main",
  });

  // Dynamic suggestions based on context
  const suggestions = useMemo(() => {
    if (selectedDocument) {
      return [
        `Summarize "${selectedDocument.title}" in 3 bullets`,
        "What are the key takeaways?",
        "Suggest improvements to this document",
      ];
    }
    return [
      `Analyze all documents in ${project?.name || "this project"}`,
      "Create a summary report",
      "What insights can you find?",
    ];
  }, [selectedDocument, project?.name]);

  // Reset messages when project changes
  useEffect(() => {
    clearMessages();
    setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, isStreaming]);

  const handleSend = async (prompt?: string) => {
    if (!companyId || !project) return;
    const contentToSend = (prompt ?? draft).trim();
    if (!contentToSend || isStreaming) return;

    // Build context for the agent
    const context = {
      component: "knowledge",
      data: {
        projectId,
        projectName: project.name,
        projectType: project.type,
        folders: project.folder_structure,
        containerTag: project.containerTag,
        // Include document context if one is selected
        ...(selectedDocument && {
          documentId: selectedDocument.id,
          title: selectedDocument.title,
          folder: selectedDocument.folder,
          contentPreview: selectedDocument.content?.slice(0, 1500),
        }),
      },
    };

    await sendMessage(contentToSend, context);
    if (!prompt) setDraft("");
  };

  if (!project) {
    return (
      <div className="glass-card flex h-full flex-col items-center justify-center rounded-xl border border-border p-6 text-center">
        <Bot className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  return (
    <div className="glass-card flex h-full min-h-0 flex-col rounded-xl border border-border">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Project Chat
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {selectedDocument ? (
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {selectedDocument.title}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              {project.name}
            </span>
          )}
        </p>
      </div>

      {/* Suggestions */}
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

      {/* Messages */}
      <div ref={viewportRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              {selectedDocument
                ? "Ask me about this document"
                : "Ask me about this project"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              I can analyze, summarize, and create new documents
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-2">
              <ChatMessage
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

              {/* Keep project-aware document deep links */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="ml-10 mr-6 space-y-2">
                  {message.toolCalls.map((tool, i) => {
                    let docCard = null;
                    if (
                      tool.result &&
                      ["create_document", "update_document", "search_documents"].includes(
                        tool.name || ""
                      )
                    ) {
                      try {
                        const parsed = JSON.parse(tool.result);
                        if (parsed?.success && parsed?.data) {
                          const d = parsed.data;
                          if (
                            (tool.name === "create_document" || tool.name === "update_document") &&
                            d.documentId
                          ) {
                            docCard = (
                              <DocumentCreatedCard
                                documentId={d.documentId}
                                title={d.title || "Untitled"}
                                primaryTag={d.tags?.primary}
                                secondaryTags={d.tags?.secondary}
                                relationships={d.relationships}
                                projectId={projectId}
                                action={tool.name === "create_document" ? "Created" : "Updated"}
                              />
                            );
                          } else if (tool.name === "search_documents" && Array.isArray(d.results)) {
                            docCard = (
                              <>
                                {d.results.slice(0, 3).map((r: any) => (
                                  <DocumentCreatedCard
                                    key={r.id}
                                    documentId={r.id}
                                    title={r.title || "Untitled"}
                                    primaryTag={r.tags?.primary}
                                    secondaryTags={r.tags?.secondary}
                                    projectId={projectId}
                                    action="Found"
                                  />
                                ))}
                              </>
                            );
                          }
                        }
                      } catch {
                        // non-json tool output
                      }
                    }
                    return <div key={i}>{docCard}</div>;
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!companyId || isStreaming}
            placeholder={
              selectedDocument
                ? `Ask about ${selectedDocument.title}...`
                : `Ask about ${project.name}...`
            }
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
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
