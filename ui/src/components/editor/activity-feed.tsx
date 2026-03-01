"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  History,
  GitBranch,
  User,
  Bot,
  ArrowRight,
  CheckCircle,
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: "comment" | "version" | "status";
  user: {
    name: string;
    avatar?: string;
  };
  content: string;
  timestamp: Date;
  metadata?: {
    from?: string;
    to?: string;
    version?: number;
  };
}

interface ActivityFeedProps {
  documentId: string;
}

// Mock data - replace with actual data fetching
const MOCK_ACTIVITIES: ActivityItem[] = [
  {
    id: "1",
    type: "comment",
    user: { name: "Kevin Dukkon" },
    content: "Lorem ipsum is placeholder text commonly used in the graphic",
    timestamp: new Date(Date.now() - 19 * 60 * 1000),
  },
  {
    id: "2",
    type: "status",
    user: { name: "Kevin Dukkon" },
    content: "changed status",
    timestamp: new Date(Date.now() - 19 * 60 * 1000),
    metadata: { from: "Draft", to: "In Progress" },
  },
  {
    id: "3",
    type: "version",
    user: { name: "Monty Hayton" },
    content: "created the document",
    timestamp: new Date(Date.now() - 86400000),
    metadata: { version: 1 },
  },
];

export function ActivityFeed({ documentId }: ActivityFeedProps) {
  const [activeTab, setActiveTab] = useState("activity");
  const [comment, setComment] = useState("");

  const handleAddComment = () => {
    if (!comment.trim()) return;
    // Add comment logic here
    setComment("");
  };

  return (
    <div className="h-48 bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <TabsList className="h-8">
            <TabsTrigger value="activity" className="text-xs gap-1">
              <MessageCircle className="w-3 h-3" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs gap-1">
              <History className="w-3 h-3" />
              Versions
            </TabsTrigger>
            <TabsTrigger value="changes" className="text-xs gap-1">
              <GitBranch className="w-3 h-3" />
              Changes
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="m-0 h-[calc(100%-40px)]">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {MOCK_ACTIVITIES.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{activity.user.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {activity.type === "status" && activity.metadata && (
                          <>
                            changed status from{" "}
                            <span className="text-foreground">{activity.metadata.from}</span>
                            {" "}to{" "}
                            <span className="text-foreground">{activity.metadata.to}</span>
                          </>
                        )}
                        {activity.type === "version" && " created the document"}
                      </span>
                    </div>

                    {activity.type === "comment" && (
                      <div className="mt-1 p-3 bg-muted rounded-lg text-sm">
                        {activity.content}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTimeAgo(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Comment Input */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Leave a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="versions" className="m-0 h-[calc(100%-40px)]">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {[
                { version: 3, user: "You", time: "8 mins ago", current: true },
                { version: 2, user: "You", time: "2 hours ago" },
                { version: 1, user: "Monty Hayton", time: "Yesterday" },
              ].map((v) => (
                <div
                  key={v.version}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    v.current
                      ? "border-purple-200 bg-purple-50"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      {v.current ? (
                        <CheckCircle className="w-4 h-4 text-purple-500" />
                      ) : (
                        <History className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Version {v.version}</p>
                      <p className="text-xs text-muted-foreground">
                        by {v.user} • {v.time}
                      </p>
                    </div>
                  </div>

                  {!v.current && (
                    <Button variant="ghost" size="sm">
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="changes" className="m-0 h-[calc(100%-40px)]">
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Change tracking coming soon</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
