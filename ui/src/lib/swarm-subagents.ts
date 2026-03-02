/**
 * Swarm Subagent System
 * 
 * Execute multiple agents in parallel for faster processing
 * Based on Ironclaw's swarm pattern
 */

import { sessions_spawn } from "@/lib/openclaw-client";

interface SubagentTask {
  id: string;
  name: string;
  prompt: string;
  model?: string;
  timeoutSeconds?: number;
}

interface SubagentResult {
  id: string;
  name: string;
  success: boolean;
  result?: string;
  error?: string;
  durationMs: number;
}

interface SwarmOptions {
  maxConcurrency?: number;  // Default: 5
  timeoutSeconds?: number;  // Default: 120
  continueOnError?: boolean; // Default: true
}

/**
 * Execute multiple subagents in parallel
 * 
 * Example:
 * ```typescript
 * const tasks = [
 *   { id: "1", name: "Summarize doc A", prompt: "Summarize..." },
 *   { id: "2", name: "Summarize doc B", prompt: "Summarize..." },
 *   { id: "3", name: "Find patterns", prompt: "Analyze..." },
 * ];
 * 
 * const results = await executeSwarm(tasks, { maxConcurrency: 3 });
 * ```
 */
export async function executeSwarm(
  tasks: SubagentTask[],
  options: SwarmOptions = {}
): Promise<SubagentResult[]> {
  const { maxConcurrency = 5, timeoutSeconds = 120, continueOnError = true } = options;
  
  const results: SubagentResult[] = [];
  const executing: Promise<void>[] = [];
  
  // Process tasks with concurrency limit
  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    const batch = tasks.slice(i, i + maxConcurrency);
    
    const batchPromises = batch.map(async (task) => {
      const startTime = Date.now();
      
      try {
        // Spawn subagent session
        const session = await sessions_spawn({
          task: task.prompt,
          agentId: "main",
          model: task.model,
          timeoutSeconds: task.timeoutSeconds || timeoutSeconds,
          cleanup: "delete", // Clean up after execution
        });
        
        // Wait for result
        const result = await waitForSessionResult(session.sessionKey, timeoutSeconds);
        
        results.push({
          id: task.id,
          name: task.name,
          success: true,
          result: result,
          durationMs: Date.now() - startTime,
        });
      } catch (err: any) {
        results.push({
          id: task.id,
          name: task.name,
          success: false,
          error: err.message,
          durationMs: Date.now() - startTime,
        });
        
        if (!continueOnError) {
          throw err;
        }
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  return results;
}

/**
 * Wait for a session to complete and return its result
 */
async function waitForSessionResult(sessionKey: string, timeoutSeconds: number): Promise<string> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  
  while (Date.now() - startTime < timeoutMs) {
    // Check session status
    const status = await checkSessionStatus(sessionKey);
    
    if (status.state === "completed") {
      return status.result || "";
    }
    
    if (status.state === "error") {
      throw new Error(status.error || "Subagent execution failed");
    }
    
    // Wait before checking again
    await sleep(1000);
  }
  
  throw new Error("Subagent execution timed out");
}

/**
 * Check session status via OpenClaw gateway API
 */
async function checkSessionStatus(sessionKey: string): Promise<{ state: string; result?: string; error?: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_OPENCLAW_URL || process.env.OPENCLAW_URL || "http://localhost:18789";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN || "";

  try {
    const res = await fetch(`${baseUrl}/hooks/session-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionKey }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // If OpenClaw is down or session not found, treat as error
      return { state: "error", error: `Session status check failed: ${res.status}` };
    }

    const data = await res.json();
    return {
      state: data.state || data.status || "unknown",
      result: data.result || data.output || "",
      error: data.error || undefined,
    };
  } catch (err: any) {
    // Network error — OpenClaw may be unreachable
    return { state: "error", error: `OpenClaw unreachable: ${err.message}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Aggregate swarm results into a coherent response
 */
export function aggregateSwarmResults(
  results: SubagentResult[],
  aggregator: (results: SubagentResult[]) => string
): string {
  return aggregator(results);
}

/**
 * Simple text aggregator - joins all results
 */
export function joinResults(results: SubagentResult[], separator = "\n\n---\n\n"): string {
  return results
    .filter((r) => r.success && r.result)
    .map((r) => `## ${r.name}\n\n${r.result}`)
    .join(separator);
}

/**
 * Get stats for a swarm execution
 */
export function swarmStats(results: SubagentResult[]) {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const avgMs = results.length > 0 ? totalMs / results.length : 0;

  return {
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    successRate: results.length > 0 ? (succeeded.length / results.length) * 100 : 0,
    totalMs,
    avgMs,
    errors: failed.map((r) => ({ id: r.id, name: r.name, error: r.error })),
  };
}
