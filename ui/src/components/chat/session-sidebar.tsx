"use client";

import { Plus, MessageSquare, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export interface ChatSession {
  id: string;
  title: string;
  session_type: string;
  status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface SessionSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  isLoading?: boolean;
}

// Group sessions by date
function groupSessionsByDate(sessions: ChatSession[]) {
  const groups: { label: string; sessions: ChatSession[] }[] = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const todaySessions: ChatSession[] = [];
  const yesterdaySessions: ChatSession[] = [];
  const last7DaysSessions: ChatSession[] = [];
  const olderSessions: ChatSession[] = [];

  sessions.forEach((session) => {
    const updated = new Date(session.updated_at);
    const isSameDay = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDay(updated, today)) {
      todaySessions.push(session);
    } else if (isSameDay(updated, yesterday)) {
      yesterdaySessions.push(session);
    } else if (updated > lastWeek) {
      last7DaysSessions.push(session);
    } else {
      olderSessions.push(session);
    }
  });

  if (todaySessions.length) groups.push({ label: "Today", sessions: todaySessions });
  if (yesterdaySessions.length) groups.push({ label: "Yesterday", sessions: yesterdaySessions });
  if (last7DaysSessions.length) groups.push({ label: "Last 7 Days", sessions: last7DaysSessions });
  if (olderSessions.length) groups.push({ label: "Older", sessions: olderSessions });

  return groups;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSessionClick,
  onNewChat,
  onDeleteSession,
  isLoading,
}: SessionSidebarProps) {
  const groups = groupSessionsByDate(sessions);

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-medium text-sm text-foreground">Chats</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewChat}
          className="h-8 text-xs text-primary hover:text-primary/80 hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New
        </Button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No chats yet
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <h4 className="text-xs font-medium text-muted-foreground px-2 mb-1">
                  {group.label}
                </h4>
                <div className="space-y-0.5">
                  {group.sessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                        activeSessionId === session.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted border border-transparent"
                      )}
                    >
                      <button
                        onClick={() => onSessionClick(session.id)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {session.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(session.updated_at), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
