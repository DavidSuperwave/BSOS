"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Database,
  Loader2,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useStreamingChat } from "@/lib/hooks/use-streaming-chat";
import { ChatMessage as SharedChatMessage } from "@/components/chat/chat-message";
import { getChatFeatureFlags } from "@/lib/chat/feature-flags";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  results?: any;
  chart?: any;
  suggestedReply?: string;
  isStreaming?: boolean;
}

interface InboxChatProps {
  companyId?: string;
  selectedMessage?: any;
  queuedPrompt?: {
    id: string;
    content: string;
  } | null;
  onSuggestReply?: (text: string) => void;
}

const SUGGESTED_QUERIES = [
  "Show me all positive replies this week",
  "How many leads replied to the Deliverability campaign?",
  "Summarize the OOO replies",
  "Which campaign has the best response rate?",
  "Draft a follow-up for interested leads",
];

export function InboxChat({
  companyId,
  selectedMessage,
  queuedPrompt,
  onSuggestReply,
}: InboxChatProps) {
  const flags = getChatFeatureFlags();
  const useUnified = flags.enableInboxUnifiedChat;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastQueuedPromptIdRef = useRef<string | null>(null);
  const {
    messages: streamingMessages,
    isStreaming,
    sendMessage: sendStreamingMessage,
    clearMessages,
  } = useStreamingChat({
    companyId: companyId || "",
    sessionType: "inbox",
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessages]);

  useEffect(() => {
    clearMessages();
    setMessages([]);
    setInput("");
    // reset when company/context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, selectedMessage?.id]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || isStreaming) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      if (useUnified) {
        await sendStreamingMessage(content, {
          component: "inbox",
          data: {
            selectedMessageId: selectedMessage?.id || null,
            selectedThreadId: selectedMessage?.thread_id || null,
            selectedCampaignId: selectedMessage?.campaign_id || null,
            selectedSentiment: selectedMessage?.sentiment || null,
          },
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: "",
                  isStreaming: false,
                }
              : m
          )
        );
      } else {
        const response = await fetch("/api/inbox/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            companyId,
            selectedMessage,
            history: messages.slice(-10),
          }),
        });
        if (!response.ok) throw new Error("Failed to get response");
        const data = await response.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: data.content,
                  sql: data.sql,
                  results: data.results,
                  chart: data.chart,
                  isStreaming: false,
                }
              : m
          )
        );
        if (data.suggestedReply && onSuggestReply) {
          onSuggestReply(data.suggestedReply);
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? {
                ...m,
                content: "Sorry, I couldn't process that request. Please try again.",
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!queuedPrompt?.id || !queuedPrompt.content) return;
    if (isLoading || (useUnified && isStreaming)) return;
    if (lastQueuedPromptIdRef.current === queuedPrompt.id) return;

    lastQueuedPromptIdRef.current = queuedPrompt.id;
    void sendMessage(queuedPrompt.content);
    // sendMessage is intentionally excluded to avoid re-trigger loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedPrompt?.id, queuedPrompt?.content, isLoading, isStreaming, useUnified]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Chat with Inbox
        </CardTitle>
      </CardHeader>

      <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && streamingMessages.length === 0 ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <Bot className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="text-sm text-foreground/80">
                  <p className="font-medium mb-1">Ask me anything about your inbox:</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Analyze reply sentiment</li>
                    <li>• Find hot leads</li>
                    <li>• Draft responses</li>
                    <li>• Campaign performance</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" />
                  Try asking:
                </p>
                {SUGGESTED_QUERIES.map((query) => (
                  <button
                    key={query}
                    onClick={() => sendMessage(query)}
                    className="w-full text-left p-2 rounded-lg bg-muted/30 hover:bg-muted/50 text-xs text-foreground/70 transition-colors flex items-center gap-2"
                  >
                    <ChevronRight className="h-3 w-3 text-primary" />
                    {query}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                    message.role === "user"
                      ? "bg-success/20"
                      : "bg-primary/10"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-3 w-3 text-success" />
                  ) : (
                    <Bot className="h-3 w-3 text-primary" />
                  )}
                </div>

                <div
                  className={cn(
                    "max-w-[85%] space-y-2",
                    message.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "p-3 rounded-lg text-sm",
                      message.role === "user"
                        ? "bg-success/10 text-foreground border border-success/20"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {message.isStreaming ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-muted-foreground">Thinking...</span>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* SQL Query */}
                  {message.sql && (
                    <div className="p-2 rounded bg-muted/70 border border-border text-xs font-mono text-foreground/80 overflow-x-auto">
                      <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                        <Database className="h-3 w-3" />
                        <span>Query</span>
                      </div>
                      {message.sql}
                    </div>
                  )}

                  {/* Results Summary */}
                  {message.results && (
                    <div className="p-2 rounded bg-muted/50 border text-xs">
                      <div className="font-medium mb-1">Results:</div>
                      {Array.isArray(message.results) ? (
                        <div className="space-y-1">
                          {message.results.slice(0, 5).map((row: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              {Object.entries(row).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-[10px]">
                                  {key}: {String(value).slice(0, 20)}
                                </Badge>
                              ))}
                            </div>
                          ))}
                          {message.results.length > 5 && (
                            <div className="text-muted-foreground">
                              +{message.results.length - 5} more...
                            </div>
                          )}
                        </div>
                      ) : (
                        <pre className="text-xs overflow-x-auto">
                          {JSON.stringify(message.results, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Quick Actions */}
                  {message.role === "assistant" && !message.isStreaming && message.suggestedReply && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => onSuggestReply?.(message.suggestedReply!)}
                    >
                      Use Suggested Reply
                    </Button>
                  )}
                </div>
              </div>
            ))}
              {useUnified
                ? streamingMessages.map((message) => (
                <SharedChatMessage
                  key={message.id}
                  message={{
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    timestamp: message.timestamp,
                    isThinking: message.isStreaming,
                    toolCalls: message.toolCalls,
                    tasks: (message as any).tasks,
                    reasoning: message.reasoning,
                    reasoningDuration: message.reasoningDuration,
                  }}
                />
              ))
                : null}
            </>
          )}
        </div>
      </div>

      <CardContent className="pt-0 pb-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Ask about your inbox..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || (useUnified && isStreaming)}
            className="flex-1 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || (useUnified && isStreaming) || !input.trim()}
            className="shrink-0"
          >
            {isLoading || (useUnified && isStreaming) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
