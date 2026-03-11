"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User } from "lucide-react";
import { format } from "date-fns";
import { AIMessage, LoadingDots, TextShimmer } from "@/components/ui/text-effects";
import { ActionTracePanel } from "./action-trace-panel";
import { SkillExecution } from "./skill-execution";
import { DocumentCreatedCard } from "./document-created-card";
import { TaskCard } from "./task-card";
import { ReportArtifactCard } from "./report-artifact-card";
import { DocumentArtifactCard } from "./document-artifact-card";
import { ScheduleArtifactCard } from "./schedule-artifact-card";
import { stripDirectiveMarkupForDisplay } from "@/lib/chat/agent-protocol";
import type { GeneratedArtifactSelection } from "./generated-artifact-types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface ToolCallView {
  name?: string;
  action?: string;
  status?: "pending" | "running" | "complete" | "error" | string;
  result?: string;
}

interface TaskView {
  id: string;
  agentType?: string;
  objective?: string;
  status?: "pending" | "running" | "complete" | "error" | string;
  progress?: number;
  step?: string;
  result?: string;
  health?: "ok" | "stalled" | "dead-letter" | string;
  maxActions?: number;
  actionsUsed?: number;
  flowId?: string;
  hardStopBehavior?: "summarize" | "ask_approval" | "abort" | string;
}

interface FlowBudgetView {
  flowId?: string;
  maxActions?: number;
  actionsUsed?: number;
  remainingActions?: number;
  hardStopBehavior?: "summarize" | "ask_approval" | "abort" | string;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  reasoning?: string;
  reasoningDuration?: number;
  toolCalls?: ToolCallView[];
  tasks?: TaskView[];
  flowBudget?: FlowBudgetView;
}

interface ChatMessageProps {
  message: ChatMessageData;
  onSaveToKnowledge?: (content: string) => void;
  onOpenArtifact?: (artifact: GeneratedArtifactSelection) => void;
  variant?: "default" | "modern";
}

export function ChatMessage({
  message,
  onSaveToKnowledge,
  onOpenArtifact,
  variant = "default",
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isModern = variant === "modern";
  const displayContent = isUser
    ? message.content
    : stripDirectiveMarkupForDisplay(message.content || "");
  const normalizedToolCalls = (message.toolCalls || []).map((tool, index) => ({
    key: `${tool.name || "tool"}-${index}`,
    name: tool.name || "Tool",
    action: tool.action || "Executing",
    status: (
      tool.status === "pending" ||
      tool.status === "running" ||
      tool.status === "complete" ||
      tool.status === "error"
        ? tool.status
        : "complete"
    ) as "pending" | "running" | "complete" | "error",
    result: tool.result,
  }));
  const normalizedTasks = (message.tasks || []).map((task, index) => ({
    key: `${task.id || "task"}-${index}`,
    id: task.id || `task-${index + 1}`,
    agentType: task.agentType || "main",
    objective: task.objective || "Delegated task",
    status:
      task.status === "pending" ||
      task.status === "running" ||
      task.status === "complete" ||
      task.status === "error"
        ? task.status
        : "pending",
    progress: typeof task.progress === "number" ? task.progress : undefined,
    step: task.step,
    result: task.result,
    health:
      task.health === "dead-letter" || task.health === "stalled" || task.health === "ok"
        ? task.health
        : "ok",
    maxActions:
      typeof task.maxActions === "number" ? task.maxActions : undefined,
    actionsUsed:
      typeof task.actionsUsed === "number" ? task.actionsUsed : undefined,
    flowId: task.flowId,
    hardStopBehavior: task.hardStopBehavior,
  }));
  const showThinkingPlaceholder =
    !isUser &&
    Boolean(message.isThinking) &&
    !message.content?.trim() &&
    !message.reasoning?.trim() &&
    normalizedToolCalls.length === 0 &&
    normalizedTasks.length === 0;

  const renderStructuredArtifact = (tool: (typeof normalizedToolCalls)[number]) => {
    if (!tool.result) return null;

    try {
      const parsed = JSON.parse(tool.result);
      if (!parsed || typeof parsed !== "object") return null;

      if (tool.name === "create_report" && parsed.reportId) {
        return (
          <ReportArtifactCard
            key={`report-${parsed.reportId}`}
            reportId={parsed.reportId}
            title={parsed.title || "Untitled report"}
            description={parsed.description}
            chartType={parsed.chartType}
            dataSource={parsed.dataSource}
            onOpen={onOpenArtifact}
          />
        );
      }

      if (tool.name === "create_report_document" && parsed.documentId) {
        return (
          <DocumentArtifactCard
            key={`structured-document-${parsed.documentId}`}
            documentId={parsed.documentId}
            title={parsed.title || "Untitled document"}
            markdown={parsed.markdown || ""}
            reportIds={Array.isArray(parsed.reportIds) ? parsed.reportIds : []}
            status={parsed.status}
            category={parsed.category}
            onOpen={onOpenArtifact}
          />
        );
      }

      if (tool.name === "schedule_daily_report" && parsed.automationId) {
        return (
          <ScheduleArtifactCard
            key={`schedule-${parsed.automationId}`}
            automationId={parsed.automationId}
            title={parsed.title || "Daily report"}
            deliveryHourUtc={parsed.deliveryHourUtc || 8}
            enabled={parsed.enabled !== false}
            reportId={parsed.reportId}
            onOpen={onOpenArtifact}
          />
        );
      }
    } catch {
      return null;
    }

    return null;
  };

  const resolveTask = async (taskId: string, decision: "approved" | "rejected") => {
    try {
      await fetch(`/api/chat/tasks/${encodeURIComponent(taskId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
    } catch {
      // best effort UI action
    }
  };

  const retryTask = async (taskId: string) => {
    try {
      await fetch(`/api/chat/tasks/${encodeURIComponent(taskId)}/retry`, {
        method: "POST",
      });
    } catch {
      // best effort UI action
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "flex-row-reverse" : "",
        isModern && "gap-0"
      )}
    >
      {!isModern ? (
        <Avatar
          className={cn(
            "h-8 w-8 shrink-0",
            isUser ? "bg-primary" : "bg-primary/10"
          )}
        >
          <AvatarFallback
            className={cn(
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {isUser ? (
              <User className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>
      ) : null}

      <div
        className={cn(
          isModern ? "flex w-full max-w-none flex-col" : "max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        {showThinkingPlaceholder ? (
          <AIMessage isThinking>
            <div className="flex items-center gap-2">
              <TextShimmer>Thinking</TextShimmer>
              <LoadingDots />
            </div>
          </AIMessage>
        ) : (
          <div
            className={cn(
              "rounded-2xl p-4",
              isModern
                ? isUser
                  ? "max-w-fit rounded-2xl bg-[#2c3345] text-white shadow-sm"
                  : "rounded-none bg-transparent p-0 text-[#20263a]"
                : isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted border border-border"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {displayContent}
              </p>
            ) : (
              displayContent.trim() ? (
                <div
                  className={cn(
                    "prose prose-sm max-w-none prose-pre:rounded-lg prose-code:before:content-none prose-code:after:content-none",
                    isModern
                      ? "prose-headings:text-[#1f2430] prose-p:text-[#2c3345] prose-strong:text-[#111827] prose-li:text-[#2c3345] prose-pre:bg-[#f4f6fb]"
                      : "dark:prose-invert prose-pre:bg-background"
                  )}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {displayContent}
                  </ReactMarkdown>
                </div>
              ) : null
            )}

            {(!isUser && (normalizedToolCalls.length > 0 || message.reasoning?.trim())) ? (
              <ActionTracePanel
                reasoning={message.reasoning}
                reasoningDuration={message.reasoningDuration}
                isStreaming={Boolean(message.isThinking)}
                toolCalls={normalizedToolCalls}
              />
            ) : null}

            {!isUser && message.flowBudget && (
              <div className="mt-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                <div>
                  Flow budget{message.flowBudget.flowId ? ` (${message.flowBudget.flowId})` : ""}:{" "}
                  {message.flowBudget.actionsUsed || 0}/{message.flowBudget.maxActions || 0}
                </div>
                <div>
                  Remaining: {message.flowBudget.remainingActions || 0}
                  {message.flowBudget.hardStopBehavior
                    ? ` | Stop: ${message.flowBudget.hardStopBehavior}`
                    : ""}
                </div>
              </div>
            )}

            {normalizedTasks.length > 0 && (
              <div className="mt-3 space-y-2">
                {normalizedTasks.map((task) => (
                  <TaskCard
                    key={task.key}
                    id={task.id}
                    agentType={task.agentType}
                    objective={task.objective}
                    status={task.status as any}
                    progress={task.progress}
                    step={
                      task.health === "dead-letter"
                        ? `${task.step || "Task stalled"} (dead-lettered)`
                        : task.health === "stalled"
                          ? `${task.step || "Task stalled"} (stalled)`
                          : task.step
                    }
                    result={task.result}
                    onApprove={() => void resolveTask(task.id, "approved")}
                    onReject={() => void resolveTask(task.id, "rejected")}
                    onRetry={() => void retryTask(task.id)}
                  />
                ))}
              </div>
            )}

            {/* Document cards from knowledge tool results */}
            {normalizedToolCalls.length > 0 &&
              normalizedToolCalls.map((tool) => {
                if (
                  !tool.result ||
                  !["create_document", "update_document", "search_documents"].includes(
                    tool.name
                  )
                )
                  return null;
                try {
                  const parsed = JSON.parse(tool.result);
                  if (!parsed?.success || !parsed?.data) return null;
                  const d = parsed.data;

                  if (
                    (tool.name === "create_document" ||
                      tool.name === "update_document") &&
                    d.documentId
                  ) {
                    return (
                      <DocumentCreatedCard
                        key={`doc-${d.documentId}`}
                        documentId={d.documentId}
                        title={d.title || "Untitled"}
                        primaryTag={d.tags?.primary}
                        secondaryTags={d.tags?.secondary}
                        relationships={d.relationships}
                        action={
                          tool.name === "create_document" ? "Created" : "Updated"
                        }
                      />
                    );
                  }

                  if (
                    tool.name === "search_documents" &&
                    Array.isArray(d.results)
                  ) {
                    return d.results.slice(0, 3).map((r: any) => (
                      <DocumentCreatedCard
                        key={`doc-${r.id}`}
                        documentId={r.id}
                        title={r.title || "Untitled"}
                        primaryTag={r.tags?.primary}
                        secondaryTags={r.tags?.secondary}
                        action="Found"
                      />
                    ));
                  }
                } catch {
                  // result is not JSON — skip
                }
                return null;
              })}

            {normalizedToolCalls.length > 0 &&
              normalizedToolCalls.map((tool) => renderStructuredArtifact(tool))}

            {message.content.includes("Running skill") && (
              <div className="mt-3">
                <SkillExecution
                  skillName="Skill Runner"
                  steps={[
                    { label: "Routing", status: "done" },
                    { label: "Context Load", status: "running" },
                    { label: "Insight Generation", status: "pending" },
                  ]}
                />
              </div>
            )}

            {/* Save to knowledge base button for assistant messages */}
            {!isUser && displayContent.length > 100 && onSaveToKnowledge && (
              <button
                onClick={() => onSaveToKnowledge(displayContent)}
                className="mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Save to Knowledge Base
              </button>
            )}
          </div>
        )}

        {!isModern ? (
          <span className="text-xs text-muted-foreground mt-1 block">
            {format(message.timestamp, "h:mm a")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
