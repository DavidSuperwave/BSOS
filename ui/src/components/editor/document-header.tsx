"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  PanelLeft,
  PanelRight,
  Maximize2,
  Minimize2,
  Save,
  Download,
  MoreHorizontal,
  Check,
} from "lucide-react";

interface DocumentHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  wordCount: number;
  lastSaved: Date | null;
  isDirty: boolean;
  isFullscreen: boolean;
  showOutline: boolean;
  showAI: boolean;
  onToggleOutline: () => void;
  onToggleAI: () => void;
  onToggleFullscreen: () => void;
  onManualSave: () => void;
  onExport?: (format: "pdf" | "word" | "markdown") => void;
}

export function DocumentHeader({
  title,
  wordCount,
  lastSaved,
  isDirty,
  isFullscreen,
  showOutline,
  showAI,
  onToggleOutline,
  onToggleAI,
  onToggleFullscreen,
  onManualSave,
  onExport,
}: DocumentHeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4">
      {/* Left - Navigation & Title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          ← Actions
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm truncate max-w-[200px]">{title}</span>
      </div>

      {/* Center - Word Count & Status */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{wordCount} words</span>
        {isDirty ? (
          <span className="text-amber-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Unsaved
          </span>
        ) : lastSaved ? (
          <span className="text-emerald-500 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Saved
          </span>
        ) : null}
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-2">
        {/* Panel Toggles */}
        <Button
          variant={showOutline ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleOutline}
          title="Toggle outline"
        >
          <PanelLeft className="w-4 h-4" />
        </Button>

        <Button
          variant={showAI ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleAI}
          title="Toggle AI assistant"
        >
          <PanelRight className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Save Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onManualSave}
          disabled={!isDirty}
          className={cn(!isDirty && "opacity-50")}
        >
          <Save className="w-4 h-4 mr-1" />
          Save
        </Button>

        {/* Export */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport?.("pdf")}>
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport?.("word")}>
              Export as Word
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport?.("markdown")}>
              Export as Markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Fullscreen */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </Button>

        {/* More */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Document settings</DropdownMenuItem>
            <DropdownMenuItem>Version history</DropdownMenuItem>
            <DropdownMenuItem className="text-red-500">Delete document</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
