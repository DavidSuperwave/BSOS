# Agent Runtime Additions (2026-02-25)

This note documents the runtime additions implemented for preset flow execution, bounded action budgets, task worker execution, and observability.

## Summary of Additions

- Canonical preset flow contracts (P0/P1/P2) with fixed action counts.
- Action budget protocol (`maxActions`, `actionsUsed`, `hardStopBehavior`) and flow identifiers.
- Worker-based queued task execution path with progress/heartbeat and dead-letter handling.
- UI telemetry for flow budget and task health states.
- Contract/document updates for `TOOLS.md` and `OPENAPI_AGENT_TOOLS.yaml`.

## New Files

- `AGENT_SURFACE_AUDIT.md`
  - Capability audit and readiness guidance across chat/tools/tasks/skills/UI.

- `src/lib/chat/preset-flows.ts`
  - Canonical flow definitions:
    - `FlowA_ResearchToKnowledge` (6)
    - `FlowB_CampaignReadout` (7)
    - `FlowC_InboxContextAssist` (6)
    - `FlowD_ApprovalGatedLaunchPrep` (10)
    - `FlowE_MultiAgentMarketSprint` (12)
    - `FlowF_LearnInstallShare` (12)
    - `FlowG_SkillHealthRemediation` (8)
  - Prompt instruction generator for flow-aware agent behavior.

- `src/lib/chat/task-worker.ts`
  - Worker claim/execute lifecycle for queued tasks.
  - Progress and heartbeat emission helpers.
  - Action-budget stop behavior handling in delegated execution.
  - Stalled/dead-letter sweep utilities.

- `src/lib/chat/flow-observability.ts`
  - Flow telemetry normalization for persistence (`flow_started`, `flow_budget`, `flow_stopped`, `flow_completed`).

- `src/app/api/chat/tasks/sweep/route.ts`
  - Authenticated endpoint to sweep company task health and dead-letter stale tasks.

- `supabase/migrations/20260225_add_agent_task_flow_budget_fields.sql`
  - Adds task fields for flow/budget/worker metadata.

## Updated Files

- `src/lib/chat/agent-protocol.ts`
  - Adds optional directive metadata: `flowId`, `stepId`, `attempt`.
  - Adds optional `<action_budget>{...}</action_budget>` directive parsing.
  - Extends prompt instructions with budget/flow contract guidance.

- `src/app/api/chat/route.ts`
  - Injects preset flow instructions into system prompts.
  - Enforces per-response action budgets in directive execution.
  - Emits flow SSE lifecycle events (`flow.started`, `flow.budget`, `flow.stopped`, `flow.completed`).
  - Attaches flow/step/attempt context to tool and task events.
  - Uses worker runtime for non-approval queued tasks.
  - Triggers task health sweep post-response (best effort).
  - Persists flow budget telemetry to `agent_decisions` (best effort, non-blocking).

- `src/lib/chat/task-runner.ts`
  - Supports flow/budget/worker metadata in task create/update:
    - `flow_id`, `step_id`, `attempt`
    - `max_actions`, `actions_used`, `hard_stop_behavior`
    - `worker_heartbeat_at`, `dead_lettered_at`
  - Adds worker helper functions:
    - `claimQueuedTaskForWorker`
    - `markTaskDeadLetter`
    - `listQueuedTasksByCompany`
    - `listRunningTasksByCompany`

- `src/app/api/chat/tasks/[id]/approve/route.ts`
  - Starts worker execution immediately on approval.

- `src/app/api/chat/tasks/[id]/retry/route.ts`
  - Starts worker execution immediately after retry queueing.

- `src/app/api/chat/tasks/route.ts`
  - Accepts optional flow/budget fields in task create payload.
  - Returns task health in list responses.

- `src/app/api/chat/tasks/[id]/route.ts`
  - Returns task health in task detail response.

- `src/app/api/chat/tasks/[id]/events/route.ts`
  - Returns task health alongside task event stream payload.

- `src/lib/hooks/use-streaming-chat.ts`
  - Tracks flow budget stream state on assistant messages.
  - Tracks task health/budget metadata in task map.
  - Handles new flow and heartbeat/stall signals.

- `src/components/chat/chat-message.tsx`
  - Renders flow budget panel on assistant messages.
  - Surfaces stalled/dead-letter task hints in task step text.

- `TOOLS.md`
  - Documents `action_budget` directive and stable step metadata.
  - Extends SSE runtime contract with flow and heartbeat events.
  - Adds `POST /api/chat/tasks/sweep`.
  - Extends task contract shape with flow/budget/worker fields.
  - Documents dead-letter lifecycle transitions and flow telemetry.

- `OPENAPI_AGENT_TOOLS.yaml`
  - Adds `/api/chat/tasks/sweep`.
  - Adds optional `actionBudget` to `ChatRequest`.
  - Extends `CreateTaskRequest` with flow/budget fields.
  - Extends `AgentTask` with flow/budget/worker fields.
  - Adds `ActionBudget` schema.

## Runtime Notes

- `hardStopBehavior` is enforced for directive budgets:
  - `summarize`: stop execution and summarize.
  - `ask_approval`: stop and request approval.
  - `abort`: fail execution.
- Task worker execution is now the default runtime path for queued non-approval tasks and for approved/retried tasks.
- Health sweeps can be triggered explicitly via `/api/chat/tasks/sweep`.

## Autonomous execution update

The task worker now performs true delegated autonomous execution instead of placeholder completion:

- Resolves delegated execution context (company container, active mapped agent, isolated/child session key).
- Calls OpenClaw for delegated objective execution through `chatSend`.
- Parses assistant directives returned by delegated execution.
- Executes delegated tool calls via `executeGatewayTool` with agent policy enforcement.
- Supports nested delegated task creation and execution with bounded depth (`MAX_AUTONOMOUS_DEPTH`).
- Persists delegated user/assistant messages and tool results into child session history.
- Preserves budget controls and hard-stop behavior through delegated execution.

## Related Context

- Ironclaw/OpenClaw upstream context:
  - [DenchHQ/ironclaw](https://github.com/DenchHQ/ironclaw)
