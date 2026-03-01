"use client";

import useSWR from "swr";

export interface ContainerStatus {
  status: string;
  container_name: string | null;
  container_port: number | null;
  container_url: string | null;
  provisioned_at: string | null;
  last_health_check: string | null;
  healthy: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("Container status check failed");
    (error as any).status = res.status;
    try {
      (error as any).info = await res.json();
    } catch {}
    throw error;
  }
  return res.json();
};

export function useContainerStatus(
  companyId: string | null,
  enabled: boolean = false
) {
  return useSWR<ContainerStatus>(
    enabled && companyId
      ? `/api/companies/${companyId}/container-status`
      : null,
    fetcher,
    {
      refreshInterval: enabled ? 4000 : 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: 4000,
    }
  );
}
