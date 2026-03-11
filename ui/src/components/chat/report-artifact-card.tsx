"use client";

import Link from "next/link";
import { BarChart3, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/contexts/company-context";
import { ChartBlock } from "@/components/documents/chart-block";

interface ReportArtifactCardProps {
  reportId: string;
  title: string;
  description?: string;
  chartType?: string;
  dataSource?: string;
}

export function ReportArtifactCard({
  reportId,
  title,
  description,
  chartType,
  dataSource,
}: ReportArtifactCardProps) {
  const { selectedCompany } = useCompany();

  return (
    <div className="mt-3 rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Report
            </Badge>
            {chartType ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {chartType}
              </Badge>
            ) : null}
            {dataSource ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {dataSource}
              </Badge>
            ) : null}
          </div>

          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}

          {selectedCompany?.id ? (
            <ChartBlock companyId={selectedCompany.id} reportId={reportId} />
          ) : null}

          <Link
            href="/analytics"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
