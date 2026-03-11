"use client";

import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/contexts/company-context";
import { ChartBlock } from "@/components/documents/chart-block";

interface DocumentArtifactCardProps {
  title: string;
  markdown: string;
  reportIds?: string[];
  status?: string;
  category?: string;
}

export function DocumentArtifactCard({
  title,
  markdown,
  reportIds = [],
  status,
  category,
}: DocumentArtifactCardProps) {
  const { selectedCompany } = useCompany();
  const renderedMarkdown = markdown.replace(/\[report:[a-zA-Z0-9-]+\]/g, "").trim();

  return (
    <div className="mt-3 rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Document
            </Badge>
            {category ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {category}
              </Badge>
            ) : null}
            {status ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {status}
              </Badge>
            ) : null}
          </div>

          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-background">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {renderedMarkdown}
            </ReactMarkdown>
          </div>

          {selectedCompany?.id && reportIds.length > 0 ? (
            <div className="space-y-4">
              {reportIds.map((reportId) => (
                <ChartBlock
                  key={reportId}
                  companyId={selectedCompany.id}
                  reportId={reportId}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
