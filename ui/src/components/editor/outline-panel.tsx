"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Type, Heading1, Heading2, Heading3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OutlinePanelProps {
  headings: { level: number; text: string; id: string }[];
  onNavigate: (id: string) => void;
}

export function OutlinePanel({ headings, onNavigate }: OutlinePanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Type className="w-4 h-4" />
          Outline
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {headings.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-4 text-center">
              Start typing to see outline...
            </p>
          ) : (
            <nav className="space-y-1">
              {headings.map((heading, index) => (
                <button
                  key={index}
                  onClick={() => onNavigate(heading.id)}
                  className={cn(
                    "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                    "flex items-center gap-2",
                    heading.level === 1 && "font-medium",
                    heading.level === 2 && "pl-4",
                    heading.level === 3 && "pl-6 text-muted-foreground"
                  )}
                >
                  {heading.level === 1 && <Heading1 className="w-3 h-3 text-muted-foreground" />}
                  {heading.level === 2 && <Heading2 className="w-3 h-3 text-muted-foreground" />}
                  {heading.level === 3 && <Heading3 className="w-3 h-3 text-muted-foreground" />}
                  <span className="truncate">{heading.text}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <Plus className="w-4 h-4 mr-2" />
          New Section
        </Button>
      </div>
    </div>
  );
}
