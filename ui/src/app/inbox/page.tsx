"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatsCard, StatsGrid } from "@/components/ui/stats-card";
import { useInboxMessages, type InboxMessage } from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { InboxChat } from "@/components/inbox-chat";
import {
  Mail,
  Search,
  Filter,
  Star,
  Archive,
  Reply,
  Sparkles,
  Send,
  X,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Clock,
  Bot,
  RefreshCw,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SENTIMENT_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  positive: { label: "Positive", color: "bg-success/10 text-success border-success/25", icon: <ThumbsUp className="h-3 w-3" /> },
  neutral: { label: "Neutral", color: "bg-muted text-muted-foreground border-border", icon: <Minus className="h-3 w-3" /> },
  negative: { label: "Negative", color: "bg-destructive/10 text-destructive border-destructive/25", icon: <ThumbsDown className="h-3 w-3" /> },
  ooo: { label: "OOO", color: "bg-warning/10 text-warning border-warning/25", icon: <Clock className="h-3 w-3" /> },
  auto_reply: { label: "Auto", color: "bg-info/10 text-info border-info/25", icon: <Bot className="h-3 w-3" /> },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  unread: { label: "Unread", color: "bg-success/10 text-success" },
  read: { label: "Read", color: "bg-muted text-muted-foreground" },
  replied: { label: "Replied", color: "bg-info/10 text-info" },
  archived: { label: "Archived", color: "bg-muted text-muted-foreground" },
  booked: { label: "Booked", color: "bg-primary/10 text-primary" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "bg-destructive/10 text-destructive" },
  medium: { label: "Medium", color: "bg-warning/10 text-warning" },
  low: { label: "Low", color: "bg-muted text-muted-foreground" },
};

function InboxSkeleton() {
  return (
    <div className="flex h-full min-h-0 gap-6">
      <div className="w-96 space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
      <div className="flex-1 rounded-xl border border-border bg-card animate-pulse" />
      <div className="w-72 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.neutral;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", config.color)}>
      {config.icon}
      {config.label}
    </span>
  );
}

function MessageRow({
  message,
  isSelected,
  onClick,
}: {
  message: InboxMessage;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-lg border transition-all",
        isSelected
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:bg-muted/50",
        message.status === "unread" && "border-l-2 border-l-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm truncate", message.status === "unread" ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>
              {message.from_name || message.from_email}
            </p>
            {message.priority === "high" && (
              <Star className="h-3 w-3 text-warning flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-foreground/70 truncate mt-0.5">{message.subject}</p>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {message.body_text?.slice(0, 80) || message.body?.replace(/<[^>]*>/g, "").slice(0, 80)}...
          </p>
          {/* Campaign tag */}
          {(message.campaign_name || message.campaign_id) && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 truncate max-w-[200px]">
                📧 {message.campaign_name || "Campaign"}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {new Date(message.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <SentimentBadge sentiment={message.sentiment} />
        </div>
      </div>
    </button>
  );
}

export default function InboxPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [deepLinks, setDeepLinks] = useState<{
    campaignId: string;
    messageId: string;
    q: string;
  }>({
    campaignId: "",
    messageId: "",
    q: "",
  });

  const [filters, setFilters] = useState<{
    campaignId?: string;
    sentiment?: string;
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
  }>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [isSendingToAgent, setIsSendingToAgent] = useState(false);
  const [queuedChatPrompt, setQueuedChatPrompt] = useState<{
    id: string;
    content: string;
  } | null>(null);

  const { data, error, isLoading, mutate } = useInboxMessages({ ...filters, companyId });

  const messages = data?.messages || [];
  const pagination = data?.pagination;
  const selected = messages.find((m) => m.id === selectedId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setDeepLinks({
      campaignId: (params.get("campaignId") || "").trim(),
      messageId: (params.get("messageId") || "").trim(),
      q: (params.get("q") || "").trim(),
    });
  }, []);

  useEffect(() => {
    const deepCampaignId = deepLinks.campaignId;
    const deepMessageId = deepLinks.messageId;
    const deepSearch = deepLinks.q;

    if (deepCampaignId || deepSearch) {
      setFilters((prev) => {
        const nextCampaignId =
          deepCampaignId && prev.campaignId !== deepCampaignId
            ? deepCampaignId
            : prev.campaignId;
        const nextSearch =
          deepSearch && prev.search !== deepSearch ? deepSearch : prev.search;
        if (nextCampaignId === prev.campaignId && nextSearch === prev.search) {
          return prev;
        }
        return {
          ...prev,
          campaignId: nextCampaignId,
          search: nextSearch,
        };
      });
    }
    if (deepMessageId) {
      setSelectedId(deepMessageId);
    }
  }, [deepLinks]);

  const sentimentCounts = messages.reduce(
    (acc, m) => {
      acc[m.sentiment] = (acc[m.sentiment] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const handleStatusUpdate = async (messageId: string, status: string) => {
    await fetch(`/api/inbox/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutate();
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setReplySending(true);
    try {
      await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.from_email,
          subject: `Re: ${selected.subject}`,
          body: replyText,
          thread_id: selected.thread_id,
          message_id: selected.id,
          company_id: selected.company_id,
        }),
      });
      setReplyText("");
      mutate();
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      setReplySending(false);
    }
  };

  const buildThreadReviewPrompt = (
    threadMessages: Array<
      InboxMessage & {
        to_email?: string;
      }
    >
  ) => {
    const sortedThread = [...threadMessages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const threadContext = sortedThread
      .map((message, index) => {
        const bodyText = (
          message.body_text ||
          message.body?.replace(/<[^>]*>/g, " ") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();

        return [
          `Message ${index + 1}`,
          `From: ${message.from_name || message.from_email} <${message.from_email}>`,
          `To: ${message.to_email || "Unknown recipient"}`,
          `Date: ${new Date(message.created_at).toLocaleString()}`,
          `Subject: ${message.subject}`,
          `Sentiment: ${message.sentiment}`,
          `Status: ${message.status}`,
          `Priority: ${message.priority}`,
          `Body: ${bodyText || "(empty)"}`,
        ].join("\n");
      })
      .join("\n\n---\n\n");

    const firstMessage = sortedThread[0];
    return [
      "Review this full email thread and provide:",
      "1) A concise summary of the conversation",
      "2) Lead intent and buying signals",
      "3) Risks or objections mentioned",
      "4) Recommended next best response",
      "5) A reply draft tailored to this lead",
      "",
      `Campaign: ${firstMessage?.campaign_name || "Unknown campaign"}`,
      `Thread ID: ${firstMessage?.thread_id || "Unknown thread"}`,
      "",
      "Thread messages:",
      threadContext,
    ].join("\n");
  };

  const handleSendThreadToAgent = async () => {
    if (!selected) return;

    setIsSendingToAgent(true);
    try {
      let threadMessages: Array<InboxMessage & { to_email?: string }> = [selected];

      if (selected.thread_id) {
        const response = await fetch(
          `/api/inbox/threads/${encodeURIComponent(selected.thread_id)}`
        );
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            threadMessages = data.messages;
          }
        }
      }

      const prompt = buildThreadReviewPrompt(threadMessages);
      setQueuedChatPrompt({
        id: `${selected.id}-${Date.now()}`,
        content: prompt,
      });
    } catch (err) {
      console.error("Failed to queue thread for agent review:", err);
    } finally {
      setIsSendingToAgent(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell header={{ title: "Inbox", subtitle: "Campaign email replies & conversations" }}>
        <InboxSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell
      header={{
        title: "Inbox",
        subtitle: `${pagination?.total || 0} messages`,
        actions: (
          <Button variant="outline" className="gap-2" onClick={() => mutate()}>
            <RefreshCw className="h-4 w-4" />
            Sync
          </Button>
        ),
      }}
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {/* Stats row */}
        <StatsGrid columns={4}>
          <StatsCard
            title="Total Messages"
            value={pagination?.total || 0}
            icon={<Mail className="h-5 w-5 text-success" />}
          />
          <StatsCard
            title="Positive"
            value={sentimentCounts.positive || 0}
            icon={<ThumbsUp className="h-5 w-5 text-success" />}
          />
          <StatsCard
            title="Unread"
            value={messages.filter((m) => m.status === "unread").length}
            icon={<MessageSquare className="h-5 w-5 text-success" />}
          />
          <StatsCard
            title="High Priority"
            value={messages.filter((m) => m.priority === "high").length}
            icon={<Star className="h-5 w-5 text-warning" />}
          />
        </StatsGrid>

        {/* Filters bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              className="pl-10"
              value={filters.search || ""}
              onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          {/* Quick filter chips */}
          {["positive", "negative", "unread"].map((f) => (
            <Button
              key={f}
              variant={filters.sentiment === f || filters.status === f ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => {
                if (f === "unread") {
                  setFilters({ ...filters, status: filters.status === f ? undefined : f });
                } else {
                  setFilters({ ...filters, sentiment: filters.sentiment === f ? undefined : f });
                }
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
          {(filters.sentiment || filters.status || filters.priority || filters.search) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Sentiment</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(SENTIMENT_CONFIG).map(([key, cfg]) => (
                      <Button
                        key={key}
                        variant={filters.sentiment === key ? "default" : "outline"}
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setFilters({ ...filters, sentiment: filters.sentiment === key ? undefined : key })}
                      >
                        {cfg.icon} {cfg.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Status</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <Button
                        key={key}
                        variant={filters.status === key ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setFilters({ ...filters, status: filters.status === key ? undefined : key })}
                      >
                        {cfg.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Priority</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                      <Button
                        key={key}
                        variant={filters.priority === key ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setFilters({ ...filters, priority: filters.priority === key ? undefined : key })}
                      >
                        {cfg.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Three-column layout */}
        <div className="flex flex-1 min-h-0 gap-4">
          {/* Message list */}
          <div className="w-96 flex-shrink-0 min-h-0 space-y-2 overflow-y-auto pr-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No messages found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Replies from your campaigns will appear here
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  isSelected={selectedId === msg.id}
                  onClick={() => {
                    setSelectedId(msg.id);
                    if (msg.status === "unread") {
                      handleStatusUpdate(msg.id, "read");
                    }
                  }}
                />
              ))
            )}
            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between pt-3 px-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!filters.page || filters.page <= 1}
                  onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {filters.page || 1} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page || 1) >= pagination.pages}
                  onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          {/* Message detail + reply */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {selected ? (
              <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <CardHeader className="flex-shrink-0 border-b border-border">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg truncate">{selected.subject}</CardTitle>
                        {selected.campaign_name && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            📧 {selected.campaign_name}
                          </Badge>
                        )}
                        {selected.campaign_id && !selected.campaign_name && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            📧 Campaign
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm text-foreground/80">
                          {selected.from_name || selected.from_email}
                        </span>
                        {selected.from_name && (
                          <span className="text-xs text-muted-foreground">
                            &lt;{selected.from_email}&gt;
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(selected.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <SentimentBadge sentiment={selected.sentiment} />
                        {selected.intent && (
                          <Badge variant="outline" className="text-xs">
                            {selected.intent.replace("_", " ")}
                          </Badge>
                        )}
                        <Badge className={STATUS_CONFIG[selected.status]?.color || ""}>
                          {STATUS_CONFIG[selected.status]?.label || selected.status}
                        </Badge>
                        <Badge className={PRIORITY_CONFIG[selected.priority]?.color || ""}>
                          {PRIORITY_CONFIG[selected.priority]?.label || selected.priority}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleSendThreadToAgent}
                        disabled={isSendingToAgent}
                        title="Send full thread context to agent"
                      >
                        <Sparkles className="h-4 w-4" />
                        {isSendingToAgent ? "Sending..." : "Review in Chat"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStatusUpdate(selected.id, "archived")}
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStatusUpdate(selected.id, "booked")}
                        title="Mark as Booked"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Message body */}
                <CardContent className="flex-1 overflow-y-auto p-6">
                  <div
                    className="prose prose-sm max-w-none text-foreground/85 prose-p:text-foreground/85 prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground"
                    dangerouslySetInnerHTML={{ __html: selected.body }}
                  />
                  {selected.ai_summary && (
                    <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20">
                      <p className="text-xs font-medium text-success mb-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> AI Summary
                      </p>
                      <p className="text-sm text-foreground/70">{selected.ai_summary}</p>
                    </div>
                  )}
                  {/* Tags */}
                  {selected.tags && selected.tags.length > 0 && (
                    <div className="mt-4 flex items-center gap-2">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      {selected.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>

                {/* Reply composer */}
                <div className="flex-shrink-0 border-t border-border p-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleReply();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleReply}
                      disabled={replySending || !replyText.trim()}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {replySending ? "Sending..." : "Reply"}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="flex-1 min-h-0 flex items-center justify-center">
                <div className="text-center">
                  <Mail className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-lg font-medium text-foreground/60">Select a message</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose a message from the list to view details
                  </p>
                </div>
              </Card>
            )}
          </div>

          {/* AI Chat Sidebar */}
          <div className="w-80 flex-shrink-0 min-h-0">
            <InboxChat
              companyId={companyId}
              selectedMessage={selected}
              queuedPrompt={queuedChatPrompt}
              onSuggestReply={(text) => setReplyText(text)}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
