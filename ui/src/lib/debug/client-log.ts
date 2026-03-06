"use client";

type DebugPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

export function clientDebugLog(payload: DebugPayload) {
  try {
    void fetch("/api/__debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        timestamp: payload.timestamp ?? Date.now(),
      }),
      keepalive: true,
    });
  } catch {
    // Ignore debug logging failures.
  }
}
