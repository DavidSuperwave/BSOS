"use client";

import { useState } from "react";

interface UseStreamingChatOptions {
  companyId: string;
  sessionType?: string;
  onError?: (error: Error) => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCallView[];
  reasoning?: string;
  reasoningDuration?: number;
  contentParts?: any[];
  tasks?: TaskView[];
  flowBudget?: FlowBudgetView;
}

interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: any;
  reasoning_content?: string | null;
  reasoning_duration?: number | null;
  content_parts?: any;
  created_at?: string;
}

interface ToolCallView {
  name: string;
  action: string;
  status: "pending" | "running" | "complete" | "error";
  result?: string;
}

interface TaskView {
  id: string;
  agentType: string;
  objective: string;
  status: "pending" | "running" | "complete" | "error";
  progress?: number;
  step?: string;
  result?: string;
  health?: "ok" | "stalled" | "dead-letter";
  maxActions?: number;
  actionsUsed?: number;
  flowId?: string;
  hardStopBehavior?: "summarize" | "ask_approval" | "abort";
}

interface FlowBudgetView {
  flowId?: string;
  maxActions: number;
  actionsUsed: number;
  remainingActions: number;
  hardStopBehavior?: "summarize" | "ask_approval" | "abort";
}

function normalizeToolStatus(value: unknown): ToolCallView["status"] {
  const text = String(value || "").toLowerCase();
  if (text === "pending") return "pending";
  if (text === "running" || text === "in_progress") return "running";
  if (text === "error" || text === "failed") return "error";
  return "complete";
}

function normalizeToolCalls(input: unknown): ToolCallView[] {
  const tools = Array.isArray(input) ? input : input ? [input] : [];
  return tools.map((tool: any, index) => ({
    name:
      tool?.name ||
      tool?.tool ||
      tool?.id ||
      `Tool ${index + 1}`,
    action:
      tool?.action ||
      tool?.type ||
      "Executing",
    status: normalizeToolStatus(tool?.status || tool?.state),
    result:
      typeof tool?.result === "string"
        ? tool.result
        : typeof tool?.output === "string"
          ? tool.output
          : tool?.error
            ? String(tool.error)
            : undefined,
  }));
}

export function useStreamingChat({
  companyId,
  sessionType = "main",
  onError
}: UseStreamingChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const sendMessage = async (content: string, componentContext?: any) => {
    if (!content.trim() || isStreaming || !companyId) return;

    // Add user message immediately (optimistic UI)
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    // Add placeholder for assistant response
    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          companyId,
          sessionId: currentSessionId,
          sessionType,
          componentContext,
          stream: true
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let reasoning = "";
      let reasoningStartAt: number | null = null;
      let reasoningDuration: number | undefined;
      let contentParts: any[] | undefined;
      let toolCalls: ToolCallView[] = [];
      let pendingSseBuffer = "";
      let taskMap: Record<string, TaskView> = {};
      let flowBudget: FlowBudgetView | undefined;

      const finalizeStream = () => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: fullContent,
                  reasoning: reasoning || undefined,
                  reasoningDuration,
                  contentParts,
                  isStreaming: false,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                  tasks: Object.values(taskMap).length > 0 ? Object.values(taskMap) : undefined,
                  flowBudget,
                }
              : m
          )
        );
        setIsStreaming(false);
      };

      const MAX_SSE_BUFFER = 1024 * 512; // 512KB safety limit

      const consumeSseText = (text: string): boolean => {
        pendingSseBuffer += text;
        // Guard against unbounded buffer growth from malformed streams
        if (pendingSseBuffer.length > MAX_SSE_BUFFER) {
          console.warn("SSE buffer exceeded size limit, truncating");
          pendingSseBuffer = pendingSseBuffer.slice(-MAX_SSE_BUFFER);
        }
        const lines = pendingSseBuffer.split("\n");
        pendingSseBuffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);

          if (data === "[DONE]") {
            finalizeStream();
            return true;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "content" && parsed.delta) {
              fullContent += parsed.delta;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, content: fullContent }
                    : m
                )
              );
            }

            if (parsed.type === "tool" && parsed.tool) {
              toolCalls = [...toolCalls, ...normalizeToolCalls(parsed.tool)];
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, toolCalls }
                    : m
                )
              );
            }

            if (parsed.type === "tool.succeeded" || parsed.type === "tool.failed") {
              const status = parsed.type === "tool.succeeded" ? "complete" : "error";
              toolCalls = [
                ...toolCalls,
                {
                  name: parsed.tool || "Tool",
                  action: status === "complete" ? "Executed" : "Failed",
                  status,
                  result:
                    typeof parsed.data === "string"
                      ? parsed.data
                      : parsed.error
                        ? String(parsed.error)
                        : JSON.stringify(parsed.data || {}),
                },
              ];
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, toolCalls }
                    : m
                )
              );
            }

            if (parsed.type === "task.created" && parsed.task?.id) {
              taskMap = {
                ...taskMap,
                [parsed.task.id]: {
                  id: parsed.task.id,
                  agentType: parsed.task.agentType || "main",
                  objective: parsed.task.objective || "Delegated task",
                  status:
                    parsed.task.status === "blocked" || parsed.task.status === "pending"
                      ? "pending"
                      : parsed.task.status === "running"
                        ? "running"
                        : parsed.task.status === "failed"
                          ? "error"
                          : "complete",
                  progress: parsed.task.progress,
                  health: "ok",
                  maxActions:
                    typeof parsed.task.maxActions === "number"
                      ? parsed.task.maxActions
                      : undefined,
                  actionsUsed:
                    typeof parsed.task.actionsUsed === "number"
                      ? parsed.task.actionsUsed
                      : undefined,
                  flowId: parsed.task.flowId || undefined,
                  hardStopBehavior: parsed.task.hardStopBehavior || undefined,
                },
              };
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, tasks: Object.values(taskMap) }
                    : m
                )
              );
            }

            if (parsed.type === "task.progress" && parsed.taskId) {
              const existing = taskMap[parsed.taskId];
              if (existing) {
                taskMap = {
                  ...taskMap,
                  [parsed.taskId]: {
                    ...existing,
                    status: "running",
                    progress: typeof parsed.progress === "number" ? parsed.progress : existing.progress,
                    step: parsed.step || existing.step,
                    health:
                      parsed.health === "stalled" || parsed.health === "dead-letter"
                        ? parsed.health
                        : existing.health || "ok",
                  },
                };
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, tasks: Object.values(taskMap) }
                      : m
                  )
                );
              }
            }

            if ((parsed.type === "task.completed" || parsed.type === "task.failed") && parsed.taskId) {
              const existing = taskMap[parsed.taskId];
              if (existing) {
                taskMap = {
                  ...taskMap,
                  [parsed.taskId]: {
                    ...existing,
                    status: parsed.type === "task.completed" ? "complete" : "error",
                    progress: parsed.type === "task.completed" ? 100 : existing.progress,
                    health:
                      parsed.type === "task.failed"
                        ? parsed.reason === "dead-letter"
                          ? "dead-letter"
                          : "stalled"
                        : existing.health || "ok",
                    result:
                      typeof parsed.result === "string"
                        ? parsed.result
                        : parsed.result
                          ? JSON.stringify(parsed.result)
                          : existing.result,
                  },
                };
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, tasks: Object.values(taskMap) }
                      : m
                  )
                );
              }
            }

            if (parsed.type === "approval.requested" && parsed.taskId) {
              const existing = taskMap[parsed.taskId];
              if (existing) {
                taskMap = {
                  ...taskMap,
                  [parsed.taskId]: {
                    ...existing,
                    status: "pending",
                    step: "Awaiting approval",
                    health: existing.health || "ok",
                  },
                };
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, tasks: Object.values(taskMap) }
                      : m
                  )
                );
              }
            }

            if (parsed.type === "reasoning-start") {
              reasoningStartAt = Date.now();
            }

            if (
              parsed.type === "flow.started" ||
              parsed.type === "flow.budget" ||
              parsed.type === "flow.completed" ||
              parsed.type === "flow.stopped"
            ) {
              const maxActions =
                typeof parsed.maxActions === "number" ? parsed.maxActions : 0;
              const actionsUsed =
                typeof parsed.actionsUsed === "number" ? parsed.actionsUsed : 0;
              const remainingActions =
                typeof parsed.remainingActions === "number"
                  ? parsed.remainingActions
                  : Math.max(0, maxActions - actionsUsed);
              flowBudget = {
                flowId: parsed.flowId || undefined,
                maxActions,
                actionsUsed,
                remainingActions,
                hardStopBehavior: parsed.hardStopBehavior || undefined,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, flowBudget } : m
                )
              );
            }

            if (parsed.type === "reasoning" || parsed.type === "reasoning-delta") {
              const delta = parsed.delta || parsed.content || "";
              if (typeof delta === "string" && delta.length > 0) {
                reasoning += delta;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, reasoning }
                      : m
                  )
                );
              }
            }

            if (parsed.type === "reasoning-end") {
              const tail = parsed.delta || parsed.content || "";
              if (typeof tail === "string" && tail.length > 0) {
                reasoning += tail;
              }
              const streamDuration =
                typeof parsed.duration === "number"
                  ? parsed.duration
                  : reasoningStartAt
                    ? Date.now() - reasoningStartAt
                    : undefined;
              reasoningDuration = streamDuration;
            }

            if (parsed.type === "content_parts" && Array.isArray(parsed.parts)) {
              contentParts = parsed.parts;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessage.id
                    ? { ...m, contentParts }
                    : m
                )
              );
            }

            if (parsed.type === "done") {
              // Capture session ID if new
              if (parsed.sessionId && !currentSessionId) {
                setCurrentSessionId(parsed.sessionId);
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        return false;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const flushed = decoder.decode();
          if (flushed && consumeSseText(flushed)) return;

          // Process any final incomplete line as a complete SSE line.
          if (pendingSseBuffer && consumeSseText("\n")) return;
          break;
        }

        if (consumeSseText(decoder.decode(value, { stream: true }))) return;
      }

      // Fallback in case the stream ends without an explicit [DONE].
      finalizeStream();
    } catch (error: any) {
      console.error("Chat error:", error);
      onError?.(error);
      
      // Update message with error
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: "Sorry, I encountered an error. Please try again.", isStreaming: false }
            : m
        )
      );
      setIsStreaming(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setCurrentSessionId(null);
  };

  const loadSession = async (sessionId: string) => {
    if (!sessionId || isStreaming) return;

    try {
      const response = await fetch(
        `/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}`
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const rows: ChatMessageRow[] = Array.isArray(data?.messages) ? data.messages : [];

      const restoredMessages: Message[] = rows
        .filter(
          (
            row
          ): row is ChatMessageRow & { role: "user" | "assistant" } =>
            row.role === "user" || row.role === "assistant"
        )
        .map((row) => ({
          id: row.id,
          role: row.role,
          content: row.content || "",
          timestamp: row.created_at ? new Date(row.created_at) : new Date(),
          toolCalls: normalizeToolCalls(row.tool_calls),
          reasoning: row.reasoning_content || undefined,
          reasoningDuration: row.reasoning_duration || undefined,
          contentParts: Array.isArray(row.content_parts) ? row.content_parts : undefined,
          tasks: [],
          flowBudget: undefined,
        }));

      setMessages(restoredMessages);
      setCurrentSessionId(sessionId);
    } catch (error: any) {
      console.error("Failed to load chat session:", error);
      onError?.(error);
      throw error;
    }
  };

  return {
    messages,
    isStreaming,
    currentSessionId,
    sendMessage,
    clearMessages,
    loadSession
  };
}
