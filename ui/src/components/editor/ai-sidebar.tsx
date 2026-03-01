"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Send,
  Loader2,
  Wand2,
  FileText,
  List,
  AlignLeft,
  Languages,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AISidebarProps {
  documentId: string;
  content: string;
  onApplyChange?: (newContent: string) => void;
}

const QUICK_ACTIONS = [
  { icon: AlignLeft, label: "Summarize", prompt: "Summarize this document" },
  { icon: Wand2, label: "Expand", prompt: "Expand on the key points" },
  { icon: List, label: "Outline", prompt: "Create an outline from this content" },
  { icon: Languages, label: "Rewrite", prompt: "Rewrite this more professionally" },
  { icon: FileText, label: "Extract", prompt: "Extract key insights" },
];

export function AISidebar({ documentId, content, onApplyChange }: AISidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your AI assistant. I can help you write, edit, and analyze this document. What would you like to do?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Mock AI response - replace with actual OpenClaw integration
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `I analyzed your document. Here's what I found:\n\n${content.slice(0, 200)}...\n\nWould you like me to expand on any section or suggest improvements?`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    handleSend();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-purple-600" />
        </div>
        <div>
          <h3 className="text-sm font-medium">AI Assistant</h3>
          <p className="text-xs text-muted-foreground">Powered by OpenClaw</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b border-border">
        <p className="text-xs text-muted-foreground mb-2">Quick actions</p>
        <div className="grid grid-cols-2 gap-1">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="sm"
              className="justify-start text-xs"
              onClick={() => handleQuickAction(action.prompt)}
            >
              <action.icon className="w-3 h-3 mr-1" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-3">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-2",
                message.role === "user" && "flex-row-reverse"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg p-3 text-sm",
                  message.role === "assistant"
                    ? "bg-muted"
                    : "bg-purple-500 text-white"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p
                  className={cn(
                    "text-xs mt-1",
                    message.role === "assistant"
                      ? "text-muted-foreground"
                      : "text-purple-100"
                  )}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2">
              <div className="bg-muted rounded-lg p-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            placeholder="Ask AI to edit, analyze, or write..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          AI can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}
