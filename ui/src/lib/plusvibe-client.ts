import { getProjectCredentials } from "./plusvibe-project";

const BASE_URL = "https://api.plusvibe.ai/api/v1";
const TIMEOUT_MS = 10_000;

export class PlusVibeError extends Error {
  constructor(
    public status: number,
    public details: string,
    public code: string = "PLUSVIBE_ERROR"
  ) {
    super(`PlusVibe ${status}: ${details}`);
  }
}

interface PlusVibeFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, any>;
  // Some PlusVibe endpoints require workspace_id in query for non-GET.
  queryOverride?: boolean;
}

function withWorkspaceQuery(path: string, workspaceId: string) {
  if (path.includes("workspace_id=")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}workspace_id=${encodeURIComponent(workspaceId)}`;
}

function sanitizeErrorDetails(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

export async function plusvibeFetch(
  path: string,
  companyId?: string,
  options?: PlusVibeFetchOptions
) {
  const creds = await getProjectCredentials(companyId);
  if (!creds) {
    throw new PlusVibeError(
      503,
      "PlusVibe API key not configured",
      "MISSING_KEY"
    );
  }

  const method = (options?.method || "GET").toUpperCase() as PlusVibeFetchOptions["method"];
  let url = `${BASE_URL}${path}`;
  let bodyPayload: Record<string, any> | undefined = options?.body;

  if (method === "GET") {
    url = `${BASE_URL}${withWorkspaceQuery(path, creds.workspaceId)}`;
  } else if (options?.queryOverride) {
    url = `${BASE_URL}${withWorkspaceQuery(path, creds.workspaceId)}`;
  } else {
    bodyPayload = {
      ...(options?.body || {}),
      workspace_id: creds.workspaceId,
    };
  }

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": creds.apiKey,
    },
    body: bodyPayload ? JSON.stringify(bodyPayload) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new PlusVibeError(res.status, sanitizeErrorDetails(text));
  }

  if (res.status === 204) return null;
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
