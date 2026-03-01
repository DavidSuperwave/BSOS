"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadModal } from "@/components/inboxing/upload-modal";
import type {
  DomainRecord,
  PlatformConnection,
  UploadJob,
  UploadJobsResponse,
} from "@/components/inboxing/types";

interface PlatformUploadPanelProps {
  companyId: string;
  domains: DomainRecord[];
  platforms: PlatformConnection[];
  uploadData: UploadJobsResponse;
  onRefresh: () => void;
  onAddPlatform: () => void;
}

function statusClass(status: string) {
  if (status === "complete") return "text-success";
  if (status === "failed") return "text-destructive";
  if (status === "processing") return "text-primary";
  return "text-muted-foreground";
}

export function PlatformUploadPanel({
  companyId,
  domains,
  platforms,
  uploadData,
  onRefresh,
  onAddPlatform,
}: PlatformUploadPanelProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [workingJobId, setWorkingJobId] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    return uploadData.jobs.filter((job) => {
      const bySearch =
        !search ||
        (job.domain || "").toLowerCase().includes(search.toLowerCase()) ||
        (job.platform_name || "").toLowerCase().includes(search.toLowerCase());
      const byStatus = !status || job.status === status;
      const byPlatform = !platform || job.platform_connection_id === platform;
      return bySearch && byStatus && byPlatform;
    });
  }, [uploadData.jobs, search, status, platform]);

  const clearHistory = async () => {
    if (!window.confirm("Clear upload history for this company?")) return;
    const res = await fetch("/api/inboxing/upload/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "Failed to clear history" }));
      alert(payload.error || "Failed to clear history");
      return;
    }
    onRefresh();
  };

  const retryJob = async (job: UploadJob) => {
    setWorkingJobId(job.id);
    try {
      const res = await fetch(`/api/inboxing/upload/${job.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Retry failed" }));
        alert(payload.error || "Retry failed");
        return;
      }
      onRefresh();
    } finally {
      setWorkingJobId(null);
    }
  };

  const deleteJob = async (job: UploadJob) => {
    setWorkingJobId(job.id);
    try {
      const res = await fetch(
        `/api/inboxing/upload/${job.id}?companyId=${encodeURIComponent(companyId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Delete failed" }));
        alert(payload.error || "Delete failed");
        return;
      }
      onRefresh();
    } finally {
      setWorkingJobId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {uploadData.summary.total} jobs •{" "}
          <span className="text-success">{uploadData.summary.completed} completed</span> •{" "}
          <span className="text-destructive">{uploadData.summary.failed} failed</span>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAddPlatform}>
            Add Platform
          </Button>
          <Button size="sm" onClick={() => setUploadModalOpen(true)}>
            <Upload className="h-4 w-4" />
            Upload Domain
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search domain/email..."
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All Platforms</option>
          {platforms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button variant="outline" size="icon" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={clearHistory}>
          Clear History
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Email / Domain</th>
              <th className="p-3">Platform</th>
              <th className="p-3">Stage</th>
              <th className="p-3">Retries</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map((job) => (
              <tr key={job.id} className="border-t border-border hover:bg-muted/10">
                <td className="p-3">
                  <div className="font-medium">{job.domain || "Unknown domain"}</div>
                  <div className="text-xs text-muted-foreground">{job.error || "Upload"}</div>
                </td>
                <td className="p-3">{job.platform_name || "Unknown"}</td>
                <td className={`p-3 text-xs ${statusClass(job.status)}`}>
                  {job.status}
                  {job.stage ? ` • ${job.stage}` : ""}
                </td>
                <td className="p-3">{job.retries}/10</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => retryJob(job)}
                      disabled={workingJobId === job.id}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteJob(job)}
                      disabled={workingJobId === job.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UploadModal
        open={uploadModalOpen}
        companyId={companyId}
        domains={domains}
        platforms={platforms}
        onOpenChange={setUploadModalOpen}
        onCompleted={onRefresh}
      />
    </div>
  );
}
