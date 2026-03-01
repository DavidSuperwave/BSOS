"use client";

import { useApiData } from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  FolderTree,
  AlertCircle,
  CheckCircle,
  Info,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface StorageData {
  containerTag: string;
  totalDocuments: number;
  byTag: Record<string, { count: number; documents: any[] }>;
  duplicates: string[];
  health: { status: string; message: string }[];
}

const TAG_LABELS: Record<string, string> = {
  company_profile: "Company Profile",
  campaign_insight: "Campaign Insights",
  icp_refinement: "ICP Definitions",
  research_summary: "Research Summaries",
  reply_analysis: "Reply Analysis",
  user_preference: "User Preferences",
  tool_config: "Tool Configuration",
  general: "General",
};

function HealthIcon({ status }: { status: string }) {
  if (status === "healthy") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  if (status === "warning") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

export function StorageDashboard() {
  const { selectedCompany } = useCompany();
  const { data, isLoading } = useApiData<StorageData>(
    selectedCompany?.id
      ? `/api/supermemory/analytics?companyId=${selectedCompany.id}`
      : null
  );
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Documents</p>
            <p className="text-2xl font-bold text-foreground mt-1">{data.totalDocuments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {Object.keys(data.byTag).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Container</p>
            <p className="text-sm font-mono text-foreground mt-1 truncate">{data.containerTag}</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Checks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Storage Health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.health.map((check, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <HealthIcon status={check.status} />
              <span className="text-foreground">{check.message}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Document Tree */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Documents by Category
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(data.byTag).map(([tag, info]) => (
            <div key={tag}>
              <button
                type="button"
                className="w-full flex items-center justify-between py-2 px-2 rounded hover:bg-muted/30 transition-colors text-left"
                onClick={() => setExpandedTag(expandedTag === tag ? null : tag)}
              >
                <div className="flex items-center gap-2">
                  {expandedTag === tag ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{TAG_LABELS[tag] || tag}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {info.count}
                </Badge>
              </button>

              {expandedTag === tag && info.documents.length > 0 && (
                <div className="ml-8 space-y-1 pb-2">
                  {info.documents.slice(0, 10).map((doc: any, j: number) => (
                    <div
                      key={doc.id || j}
                      className="flex items-start gap-2 py-1.5 px-2 text-xs rounded bg-muted/20"
                    >
                      <FileText className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground line-clamp-2">
                        {doc.content || "No content preview"}
                      </span>
                    </div>
                  ))}
                  {info.documents.length > 10 && (
                    <p className="text-xs text-muted-foreground ml-5">
                      + {info.documents.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {Object.keys(data.byTag).length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No documents stored yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Duplicates */}
      {data.duplicates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
              <AlertCircle className="h-4 w-4" />
              Potential Duplicates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.duplicates.map((dup, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {dup}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
