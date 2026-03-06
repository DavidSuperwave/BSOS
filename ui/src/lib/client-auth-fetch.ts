"use client";

import { createClient } from "@/lib/supabase/client";

let browserSupabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!browserSupabase) browserSupabase = createClient();
  return browserSupabase;
}

function shouldAttachAuthHeader(input: RequestInfo | URL) {
  if (typeof window === "undefined") return false;
  const origin = window.location.origin;

  if (typeof input === "string") {
    return input.startsWith("/") || input.startsWith(origin);
  }

  if (input instanceof URL) {
    return input.origin === window.location.origin;
  }

  return input.url.startsWith("/") || input.url.startsWith(origin);
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers ?? undefined);

  if (!headers.has("Authorization") && shouldAttachAuthHeader(input)) {
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
      }
    } catch {}
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin",
  });
}
