"use client";

import { Fragment, ReactNode, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/company-context";
import { useDocument, useReport } from "@/lib/hooks";
import { ChartBlock } from "@/components/documents/chart-block";
import {
  BarChart3,
  Clock3,
  ExternalLink,
  FileText,
  PanelRightClose,
} from "lucide-react";
import type { GeneratedArtifactSelection } from "./generated-artifact-types";

interface GeneratedArtifactViewerProps {
  artifact: GeneratedArtifactSelection;
  onClose: () => void;
}

const REPORT_TOKEN_REGEX = /\[report:([^\]]+)\]/g;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatHour(hour: number) {
  const normalized = Math.min(23, Math.max(0, Math.trunc(hour)));
  return `${String(normalized).padStart(2, "0")}:00 UTC`;
}

function wrapTextMarks(
  textNode: any,
  content: ReactNode,
  key: string
): ReactNode {
  const marks = Array.isArray(textNode?.marks) ? textNode.marks : [];
  return marks.reduce<ReactNode>((acc, mark: any, index) => {
    const markKey = `${key}-mark-${index}`;
    switch (mark?.type) {
      case "bold":
        return <strong key={markKey}>{acc}</strong>;
      case "italic":
        return <em key={markKey}>{acc}</em>;
      case "code":
        return (
          <code
            key={markKey}
            className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800"
          >
            {acc}
          </code>
        );
      default:
        return <Fragment key={markKey}>{acc}</Fragment>;
    }
  }, content);
}

function normalizeStructuredContent(rawContent: any): any | null {
  if (rawContent && typeof rawContent === "object" && rawContent.type === "doc") {
    return rawContent;
  }

  if (typeof rawContent === "string") {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object" && parsed.type === "doc") {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function StructuredDocumentBody({
  content,
  embeddedReports,
  companyId,
}: {
  content: any;
  embeddedReports: string[];
  companyId?: string;
}) {
  const structured = useMemo(() => normalizeStructuredContent(content), [content]);
  const fallbackText =
    typeof content === "string"
      ? content
      : !structured && content
        ? JSON.stringify(content, null, 2)
        : "";

  const rendered = useMemo(() => {
    if (!structured || !Array.isArray(structured.content)) {
      return { nodes: null as ReactNode, renderedReportIds: [] as string[] };
    }

    let fallbackReportIndex = 0;
    const renderedReportIds = new Set<string>();

    const resolveReportId = (rawReference: string) => {
      const normalizedReference = rawReference.trim();
      if (UUID_REGEX.test(normalizedReference)) {
        renderedReportIds.add(normalizedReference);
        return normalizedReference;
      }
      const fallbackId = embeddedReports[fallbackReportIndex];
      fallbackReportIndex += 1;
      if (fallbackId) {
        renderedReportIds.add(fallbackId);
      }
      return fallbackId || null;
    };

    const renderInline = (nodes: any[], keyPrefix: string): ReactNode[] =>
      nodes.map((node, index) => {
        const key = `${keyPrefix}-inline-${index}`;
        if (node?.type === "text") {
          return (
            <Fragment key={key}>
              {wrapTextMarks(node, node.text || "", key)}
            </Fragment>
          );
        }
        if (node?.type === "hardBreak") {
          return <br key={key} />;
        }
        if (Array.isArray(node?.content)) {
          return <Fragment key={key}>{renderInline(node.content, key)}</Fragment>;
        }
        return null;
      });

    const renderBlock = (node: any, key: string): ReactNode => {
      if (!node || typeof node !== "object") return null;

      if (node.type === "heading") {
        const level = Math.min(3, Math.max(1, Number(node.attrs?.level || 1)));
        const className =
          level === 1
            ? "text-3xl font-semibold tracking-tight"
            : level === 2
              ? "text-xl font-semibold"
              : "text-lg font-semibold";
        const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as
          | "h1"
          | "h2"
          | "h3";
        return (
          <Tag key={key} className={className}>
            {renderInline(node.content || [], key)}
          </Tag>
        );
      }

      if (node.type === "paragraph") {
        const textValue = Array.isArray(node.content)
          ? node.content
              .map((child: any) => (child?.type === "text" ? child.text || "" : ""))
              .join("")
              .trim()
          : "";
        const tokenMatch = textValue.match(/^\[report:(.+)\]$/);
        if (tokenMatch && companyId) {
          const reportId = resolveReportId(tokenMatch[1]);
          if (reportId) {
            return (
              <div key={key} className="my-6">
                <ChartBlock companyId={companyId} reportId={reportId} />
              </div>
            );
          }
        }

        return (
          <p key={key} className="text-[15px] leading-7 text-slate-700">
            {renderInline(node.content || [], key)}
          </p>
        );
      }

      if (node.type === "bulletList") {
        return (
          <ul key={key} className="list-disc space-y-2 pl-6 text-[15px] text-slate-700">
            {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
          </ul>
        );
      }

      if (node.type === "orderedList") {
        return (
          <ol key={key} className="list-decimal space-y-2 pl-6 text-[15px] text-slate-700">
            {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
          </ol>
        );
      }

      if (node.type === "listItem") {
        return (
          <li key={key} className="pl-1">
            {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
          </li>
        );
      }

      if (node.type === "blockquote") {
        return (
          <blockquote key={key} className="border-l-2 border-slate-300 pl-4 italic text-slate-600">
            {(node.content || []).map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
          </blockquote>
        );
      }

      if (node.type === "codeBlock") {
        const codeText = Array.isArray(node.content)
          ? node.content.map((child: any) => child?.text || "").join("")
          : "";
        return (
          <pre
            key={key}
            className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100"
          >
            <code>{codeText}</code>
          </pre>
        );
      }

      if (Array.isArray(node.content)) {
        return (
          <div key={key} className="space-y-4">
            {node.content.map((child: any, index: number) => renderBlock(child, `${key}-${index}`))}
          </div>
        );
      }

      return null;
    };

    return {
      nodes: structured.content.map((node: any, index: number) =>
        renderBlock(node, `doc-block-${index}`)
      ),
      renderedReportIds: Array.from(renderedReportIds),
    };
  }, [companyId, embeddedReports, structured]);

  const remainingReports = embeddedReports.filter(
    (reportId) => !rendered.renderedReportIds.includes(reportId)
  );

  if (!structured) {
    return (
      <div className="space-y-6">
        <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
          {fallbackText}
        </div>
        {companyId && embeddedReports.length > 0 ? (
          <div className="space-y-6 border-t border-slate-200 pt-6">
            {embeddedReports.map((reportId) => (
              <ChartBlock key={reportId} companyId={companyId} reportId={reportId} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rendered.nodes}
      {companyId && remainingReports.length > 0 ? (
        <div className="space-y-6 border-t border-slate-200 pt-6">
          {remainingReports.map((reportId) => (
            <ChartBlock key={reportId} companyId={companyId} reportId={reportId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ViewerShell({
  title,
  badges,
  onClose,
  actions,
  children,
}: {
  title: string;
  badges: string[];
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-[#eef2f7]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            {badges.map((badge) => (
              <Badge
                key={badge}
                variant="outline"
                className="border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600"
              >
                {badge}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ReportViewer({
  artifact,
  onClose,
}: {
  artifact: Extract<GeneratedArtifactSelection, { type: "report" }>;
  onClose: () => void;
}) {
  const { selectedCompany } = useCompany();

  return (
    <ViewerShell
      title={artifact.title}
      badges={["report", artifact.chartType || "chart", artifact.dataSource || "data"]}
      onClose={onClose}
      actions={
        <Button asChild variant="outline" size="sm">
          <a href="/analytics">
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Analytics
          </a>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            {artifact.title}
          </h2>
          {artifact.description ? (
            <p className="max-w-2xl text-[15px] leading-7 text-slate-600">
              {artifact.description}
            </p>
          ) : null}
        </div>

        {selectedCompany?.id ? (
          <ChartBlock companyId={selectedCompany.id} reportId={artifact.reportId} range="7d" />
        ) : (
          <p className="text-sm text-slate-500">Select a company to view this report.</p>
        )}
      </div>
    </ViewerShell>
  );
}

function DocumentViewer({
  artifact,
  onClose,
}: {
  artifact: Extract<GeneratedArtifactSelection, { type: "document" }>;
  onClose: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { data, isLoading } = useDocument(selectedCompany?.id, artifact.documentId);
  const document = data?.document;
  const embeddedReports =
    Array.isArray(document?.embedded_reports) && document?.embedded_reports.length > 0
      ? document.embedded_reports
      : artifact.reportIds || [];
  const content = document?.content ?? artifact.markdown ?? "";

  return (
    <ViewerShell
      title={document?.title || artifact.title}
      badges={[
        "document",
        document?.category || artifact.category || "report",
        document?.status || artifact.status || "published",
      ]}
      onClose={onClose}
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading document...</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              {document?.title || artifact.title}
            </h2>
          </div>
          <StructuredDocumentBody
            content={content}
            embeddedReports={embeddedReports}
            companyId={selectedCompany?.id}
          />
        </div>
      )}
    </ViewerShell>
  );
}

function ScheduleViewer({
  artifact,
  onClose,
}: {
  artifact: Extract<GeneratedArtifactSelection, { type: "schedule" }>;
  onClose: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { data } = useReport(selectedCompany?.id, artifact.reportId);
  const report = data?.report;

  return (
    <ViewerShell
      title={artifact.title}
      badges={["daily automation", artifact.enabled === false ? "disabled" : "enabled"]}
      onClose={onClose}
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Clock3 className="h-5 w-5" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            {artifact.title}
          </h2>
          <p className="text-[15px] leading-7 text-slate-600">
            This automation runs every day at {formatHour(artifact.deliveryHourUtc)} and generates
            a fresh document in the background.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {artifact.enabled === false ? "Disabled" : "Enabled"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Schedule</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              Daily at {formatHour(artifact.deliveryHourUtc)}
            </p>
          </div>
        </div>

        {artifact.reportId && selectedCompany?.id ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Linked report</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {report?.title || artifact.reportId}
              </p>
            </div>
            <ChartBlock companyId={selectedCompany.id} reportId={artifact.reportId} range="7d" />
          </div>
        ) : null}
      </div>
    </ViewerShell>
  );
}

export function GeneratedArtifactViewer({
  artifact,
  onClose,
}: GeneratedArtifactViewerProps) {
  if (artifact.type === "report") {
    return <ReportViewer artifact={artifact} onClose={onClose} />;
  }

  if (artifact.type === "document") {
    return <DocumentViewer artifact={artifact} onClose={onClose} />;
  }

  return <ScheduleViewer artifact={artifact} onClose={onClose} />;
}

