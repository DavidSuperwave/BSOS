"use client";

import { useReport, useReportData } from "@/lib/hooks";
import { ReportCard } from "@/components/reports/report-card";

interface ChartBlockProps {
  companyId: string;
  reportId: string;
  range?: "24h" | "7d" | "30d" | "90d";
}

export function ChartBlock({ companyId, reportId, range = "7d" }: ChartBlockProps) {
  const { data: reportData, isLoading: reportLoading } = useReport(companyId, reportId);
  const { data: dataset, isLoading: dataLoading } = useReportData(companyId, reportId, { range });

  if (reportLoading) {
    return <div className="text-sm text-muted-foreground">Loading embedded report...</div>;
  }

  if (!reportData?.report) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        Report {reportId} was not found or is not accessible.
      </div>
    );
  }

  return (
    <ReportCard
      report={reportData.report}
      data={dataset?.data || []}
      loading={dataLoading}
    />
  );
}
