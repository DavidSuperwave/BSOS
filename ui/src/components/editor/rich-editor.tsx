"use client";

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Heading1,
  Heading2,
  Heading3,
  Sparkles,
  Check,
  X,
} from "lucide-react";

interface RichEditorProps {
  content: string;
  onChange: (content: string) => void;
  onHeadingsChange?: (headings: { level: number; text: string; id: string }[]) => void;
  onAIAction?: (action: string, selectedText?: string) => void;
}

export function RichEditor({
  content,
  onChange,
  onHeadingsChange,
  onAIAction,
}: RichEditorProps) {
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [showAIAccept, setShowAIAccept] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing or type '/' for commands...",
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);

      // Extract headings for outline
      const headings: { level: number; text: string; id: string }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          const id = `heading-${headings.length}`;
          headings.push({
            level: node.attrs.level,
            text: node.textContent,
            id,
          });
        }
      });
      onHeadingsChange?.(headings);
    },
  });

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleAISuggestion = useCallback(() => {
    const selection = editor?.state.selection;
    const selectedText = selection?.empty
      ? ""
      : editor?.state.doc.textBetween(selection?.from || 0, selection?.to || 0);

    onAIAction?.("improve", selectedText);
    
    // Mock AI response for now
    setAiSuggestion("This is an AI-improved version of your text...");
    setShowAIAccept(true);
  }, [editor, onAIAction]);

  const acceptSuggestion = useCallback(() => {
    if (aiSuggestion && editor) {
      editor.commands.insertContent(aiSuggestion);
      setAiSuggestion(null);
      setShowAIAccept(false);
    }
  }, [aiSuggestion, editor]);

  const rejectSuggestion = useCallback(() => {
    setAiSuggestion(null);
    setShowAIAccept(false);
  }, []);

  if (!editor) {
    return <div className="animate-pulse h-96 bg-muted rounded" />;
  }

  return (
    <div className="relative">
      {/* Floating Toolbar */}
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="bg-background border border-border shadow-lg rounded-lg p-1 flex items-center gap-1"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAISuggestion}
            className="text-purple-500 hover:text-purple-600"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            Ask AI
          </Button>

          <div className="w-px h-4 bg-border mx-1" />

          <Button
            variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("bold") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("strike") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="w-4 h-4" />
          </Button>

          <Button
            variant={editor.isActive("code") ? "secondary" : "ghost"}
            size="icon"
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="w-4 h-4" />
          </Button>
        </BubbleMenu>
      )}

      {/* AI Suggestion */}
      {showAIAccept && aiSuggestion && (
        <div className="absolute -top-16 left-0 right-0 bg-purple-50 border border-purple-200 rounded-lg p-3 shadow-lg z-10">
          <p className="text-sm text-purple-800 mb-2">{aiSuggestion}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={acceptSuggestion} className="bg-purple-500 hover:bg-purple-600">
              <Check className="w-3 h-3 mr-1" />
              Accept
            </Button>
            <Button size="sm" variant="ghost" onClick={rejectSuggestion}>
              <X className="w-3 h-3 mr-1" />
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Editor */}
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm max-w-none",
          "prose-headings:font-semibold prose-headings:text-foreground",
          "prose-p:text-foreground prose-p:leading-relaxed",
          "prose-strong:text-foreground prose-strong:font-semibold",
          "prose-ul:list-disc prose-ol:list-decimal",
          "prose-blockquote:border-l-2 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic",
          "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
          "focus:outline-none"
        )}
      />
    </div>
  );
}
