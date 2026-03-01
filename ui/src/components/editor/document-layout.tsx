"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { DocumentHeader } from "./document-header";
import { OutlinePanel } from "./outline-panel";
import { RichEditor } from "./rich-editor";
import { AISidebar } from "./ai-sidebar";
import { ActivityFeed } from "./activity-feed";
import { PanelLeft, PanelRight, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentLayoutProps {
  documentId: string;
  projectId: string;
  initialContent?: string;
  initialTitle?: string;
  onSave?: (content: string, title: string) => void;
  onExport?: (format: "pdf" | "word" | "markdown") => void;
}

export function DocumentLayout({
  documentId,
  projectId,
  initialContent = "",
  initialTitle = "Untitled Document",
  onSave,
  onExport,
}: DocumentLayoutProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [showOutline, setShowOutline] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [headings, setHeadings] = useState<{ level: number; text: string; id: string }[]>([]);

  // Auto-save with debounce
  useEffect(() => {
    if (!isDirty) return;
    
    const timer = setTimeout(() => {
      onSave?.(content, title);
      setLastSaved(new Date());
      setIsDirty(false);
    }, 30000); // 30 seconds

    return () => clearTimeout(timer);
  }, [content, title, isDirty, onSave]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setIsDirty(true);
    
    // Update word count
    const text = newContent.replace(/<[^>]*>/g, "");
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    setWordCount(words.length);
  }, []);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setIsDirty(true);
  }, []);

  const handleHeadingsChange = useCallback((newHeadings: { level: number; text: string; id: string }[]) => {
    setHeadings(newHeadings);
  }, []);

  const handleManualSave = useCallback(() => {
    onSave?.(content, title);
    setLastSaved(new Date());
    setIsDirty(false);
  }, [content, title, onSave]);

  const handleAIAction = useCallback((action: string, selectedText?: string) => {
    if (!showAI) setShowAI(true);
    // AI action will be handled by the AI sidebar
  }, [showAI]);

  return (
    <div className={cn(
      "flex flex-col h-full bg-background",
      isFullscreen && "fixed inset-0 z-50"
    )}>
      {/* Header */}
      <DocumentHeader
        title={title}
        onTitleChange={handleTitleChange}
        wordCount={wordCount}
        lastSaved={lastSaved}
        isDirty={isDirty}
        isFullscreen={isFullscreen}
        onToggleOutline={() => setShowOutline(!showOutline)}
        onToggleAI={() => setShowAI(!showAI)}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onManualSave={handleManualSave}
        onExport={onExport}
        showOutline={showOutline}
        showAI={showAI}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Outline */}
        {showOutline && (
          <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
            <OutlinePanel
              headings={headings}
              onNavigate={(id) => {
                const element = document.getElementById(id);
                element?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </div>
        )}

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8">
              {/* Title Input */}
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Document Title"
                className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 mb-2"
              />
              
              {/* Timestamp */}
              <div className="text-sm text-muted-foreground mb-6">
                {lastSaved ? (
                  <>Updated {formatTimeAgo(lastSaved)}</>
                ) : (
                  <>Not saved yet</>
                )}
                {isDirty && <span className="ml-2 text-amber-500">• Unsaved changes</span>}
              </div>

              {/* Rich Editor */}
              <RichEditor
                content={content}
                onChange={handleContentChange}
                onHeadingsChange={handleHeadingsChange}
                onAIAction={handleAIAction}
              />
            </div>
          </div>

          {/* Bottom - Activity Feed */}
          <div className="border-t border-border bg-muted/20">
            <ActivityFeed documentId={documentId} />
          </div>
        </div>

        {/* Right Sidebar - AI */}
        {showAI && (
          <div className="w-80 border-l border-border bg-muted/30 flex flex-col">
            <AISidebar
              documentId={documentId}
              content={content}
              onApplyChange={(newContent) => {
                handleContentChange(newContent);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
