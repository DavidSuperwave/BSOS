"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { useReports } from "@/lib/hooks";
import { ChartBlock } from "./chart-block";

interface DocumentEditorProps {
  companyId: string;
  initialContent?: any;
  initialEmbeddedReports?: string[];
  onChange: (payload: { content: any; embeddedReportIds: string[] }) => void;
}

function parseInitialContent(initialContent: any) {
  if (initialContent && typeof initialContent === "object" && initialContent.type) {
    return initialContent;
  }
  if (typeof initialContent === "string" && initialContent.trim()) {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: initialContent }] }],
    };
  }
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function extractEmbeddedReportIds(text: string): string[] {
  const matches = text.match(/\[report:([a-zA-Z0-9-]+)\]/g) || [];
  const ids = matches
    .map((m) => m.replace("[report:", "").replace("]", ""))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export function DocumentEditor({
  companyId,
  initialContent,
  initialEmbeddedReports,
  onChange,
}: DocumentEditorProps) {
  const [selectedReportId, setSelectedReportId] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "90d">("7d");
  const { data: reportsData } = useReports(companyId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write your document. Use [report:<id>] tokens for embedded charts.",
      }),
    ],
    content: parseInitialContent(initialContent),
    onUpdate({ editor: currentEditor }) {
      const json = currentEditor.getJSON();
      const embeddedReportIds = extractEmbeddedReportIds(currentEditor.getText());
      onChange({ content: json, embeddedReportIds });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const json = parseInitialContent(initialContent);
    editor.commands.setContent(json);
  }, [editor, initialContent]);

  const embeddedFromEditor = useMemo(() => {
    if (!editor) return initialEmbeddedReports || [];
    return extractEmbeddedReportIds(editor.getText());
  }, [editor, initialEmbeddedReports, editor?.state]);

  const embeddedReports = embeddedFromEditor.length
    ? embeddedFromEditor
    : initialEmbeddedReports || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Bold
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Italic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Bullet List
        </Button>

        <select
          value={selectedReportId}
          onChange={(e) => setSelectedReportId(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="">Select report to embed</option>
          {(reportsData?.reports || []).map((report) => (
            <option key={report.id} value={report.id}>
              {report.title}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedReportId}
          onClick={() => {
            if (!selectedReportId || !editor) return;
            editor.chain().focus().insertContent(`\n[report:${selectedReportId}]\n`).run();
          }}
        >
          Embed Report
        </Button>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        <EditorContent editor={editor} className="prose prose-sm max-w-none min-h-[220px] dark:prose-invert" />
      </div>

      {embeddedReports.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Embedded live charts</p>
          <div className="space-y-4">
            {embeddedReports.map((id) => (
              <ChartBlock key={id} companyId={companyId} reportId={id} range={range} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Chart range</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as "24h" | "7d" | "30d" | "90d")}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="90d">90d</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
