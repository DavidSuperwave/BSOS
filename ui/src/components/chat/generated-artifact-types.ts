"use client";

export type GeneratedArtifactSelection =
  | {
      type: "report";
      reportId: string;
      title: string;
      description?: string;
      chartType?: string;
      dataSource?: string;
    }
  | {
      type: "document";
      documentId: string;
      title: string;
      markdown?: string;
      reportIds?: string[];
      status?: string;
      category?: string;
    }
  | {
      type: "schedule";
      automationId?: string;
      title: string;
      deliveryHourUtc: number;
      enabled?: boolean;
      reportId?: string;
    };
