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
 * Check session status via API
 */
async function checkSessionStatus(sessionKey: string): Promise<{ state: string; result?: string; error?: string }> {
  // This would call your session status endpoint
  // For now, return a placeholder
  return { state: "completed", result: "" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Aggregate swarm results into a coherent response
 */
export function aggregateSwarmResults(
  results: SubagentResult[],
  aggregatorPrompt: string
): string {
  const successfulResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);
  
  let aggregated = `${aggregatorPrompt}\n\n`;
  
  aggregated += `## Successful Results (${successfulResults.length}/${results.length})\n\n`;
  
  for (const result of successfulResults) {
    aggregated += `### ${result.name}\n${result.result}\n\n`;
  }
  
  if (failedResults.length > 0) {
    aggregated += `## Failed Tasks (${failedResults.length}/${results.length})\n\n`;
    
    for (const result of failedResults) {
      aggregated += `- ${result.name}: ${result.error}\n`;
    }
  }
  
  return aggregated;
}

/**
 * Use case: Analyze multiple documents in parallel
 */
export async function analyzeDocumentsInParallel(
  documents: { id: string; title: string; content: string }[],
  analysisType: "summarize" | "extract_insights" | "categorize"
): Promise<SubagentResult[]> {
  const tasks: SubagentTask[] = documents.map((doc) => ({
    id: doc.id,
    name: `Analyze: ${doc.title}`,
    prompt: buildAnalysisPrompt(doc, analysisType),
  }));
  
  return executeSwarm(tasks, { maxConcurrency: 5 });
}

function buildAnalysisPrompt(
  doc: { title: string; content: string },
  analysisType: string
): string {
  const prompts: Record<string, string> = {
    summarize: `Summarize the following document in 3-5 bullet points:\n\nTitle: ${doc.title}\n\nContent:\n${doc.content.slice(0, 8000)}`,
    
    extract_insights: `Extract key insights from this document:\n\nTitle: ${doc.title}\n\nContent:\n${doc.content.slice(0, 8000)}\n\nProvide:\n1. Main takeaways\n2. Action items\n3. Questions raised`,
    
    categorize: `Categorize this document:\n\nTitle: ${doc.title}\n\nContent:\n${doc.content.slice(0, 8000)}\n\nProvide:\n1. Primary category\n2. Secondary tags\n3. Related topics`,
  };
  
  return prompts[analysisType] || prompts.summarize;
}
