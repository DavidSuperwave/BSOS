import type { InboxingDomain } from "@/lib/hooks";

export interface PlatformConnection {
  id: string;
  platform: string;
  name: string;
  verification_status?: string;
}

export interface UploadJob {
  id: string;
  domain_id: string | null;
  domain: string | null;
  status: "pending" | "processing" | "complete" | "failed";
  retries: number;
  stage: string;
  platform_name: string | null;
  platform_connection_id: string | null;
  error?: string | null;
  created_at: string;
}

export interface UploadJobsResponse {
  jobs: UploadJob[];
  summary: {
    total: number;
    completed: number;
    failed: number;
  };
}

export type DomainRecord = InboxingDomain;
