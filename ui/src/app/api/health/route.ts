import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

interface ServiceStatus {
  status: "ok" | "error" | "unavailable";
  latencyMs?: number;
  error?: string;
}

export async function GET() {
  const results: Record<string, ServiceStatus> = {};

  // Check Supabase
  const supabaseUrl = envConfig.supabase.url();
  const supabaseKey =
    envConfig.supabase.serviceRoleKey() || envConfig.supabase.anonKey();

  if (supabaseUrl && supabaseKey) {
    const start = Date.now();
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from("companies").select("id").limit(1);
      const latency = Date.now() - start;
      results.supabase = error
        ? { status: "error", latencyMs: latency, error: error.message }
        : { status: "ok", latencyMs: latency };
    } catch (e: any) {
      results.supabase = {
        status: "error",
        latencyMs: Date.now() - start,
        error: e.message,
      };
    }
  } else {
    results.supabase = { status: "unavailable", error: "Missing credentials" };
  }

  // Check OpenClaw gateway
  const openclawUrl = envConfig.openclaw.url();
  if (openclawUrl) {
    const start = Date.now();
    try {
      const res = await fetch(`${openclawUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      results.openclaw = res.ok
        ? { status: "ok", latencyMs: latency }
        : { status: "error", latencyMs: latency, error: `HTTP ${res.status}` };
    } catch (e: any) {
      results.openclaw = {
        status: "error",
        latencyMs: Date.now() - start,
        error: e.message,
      };
    }
  } else {
    results.openclaw = { status: "unavailable", error: "OPENCLAW_URL not set" };
  }

  // Check Supermemory
  const supermemoryKey = envConfig.supermemory.apiKey();
  if (supermemoryKey) {
    const start = Date.now();
    try {
      const res = await fetch("https://api.supermemory.ai/v3/memories", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${supermemoryKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      results.supermemory = res.ok
        ? { status: "ok", latencyMs: latency }
        : { status: "error", latencyMs: latency, error: `HTTP ${res.status}` };
    } catch (e: any) {
      results.supermemory = {
        status: "error",
        latencyMs: Date.now() - start,
        error: e.message,
      };
    }
  } else {
    results.supermemory = {
      status: "unavailable",
      error: "SUPERMEMORY_API_KEY not set",
    };
  }

  const allOk = Object.values(results).every((s) => s.status === "ok");
  const anyError = Object.values(results).some((s) => s.status === "error");

  return NextResponse.json(
    {
      status: allOk ? "healthy" : anyError ? "degraded" : "partial",
      timestamp: new Date().toISOString(),
      services: results,
    },
    { status: allOk ? 200 : 503 }
  );
}
