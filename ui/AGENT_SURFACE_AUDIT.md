# Agent Surface Audit

Last updated: 2026-02-25
Status: Active
Scope: Chat orchestration, tool gateway, task runtime, skills lifecycle, UI telemetry

## Surface Readiness

### 1) Chat Orchestrator

Files:
- `src/app/api/chat/route.ts`
- `src/lib/chat/agent-protocol.ts`
- `src/lib/chat/feature-flags.ts`

Current behavior:
- Routes by `sessionType` and company-scoped agent.
- Parses structured directives: `<tool_call>`, `<task_call>`, and fenced `agent-actions`.
- Emits SSE content and lifecycle events.

Readiness:
- Ready for deterministic tool-first flows.
- Requires runtime budget enforcement and task worker integration for delegated flows.

### 2) Tool Gateway and Policy

Files:
- `src/lib/chat/tool-gateway.ts`
- `src/app/api/tools/route.ts`
- `src/lib/agent-tools.ts`
- `src/lib/knowledge/knowledge-tools.ts`

Current behavior:
- Enforces per-agent tool allowlists.
- Dispatches to generic tools and knowledge tools.
- Persists invocation telemetry.

Readiness:
- Ready for bounded action plans inside policy limits.
- Requires explicit flow policy profiles to prevent policy drift.

### 3) Task Runtime

Files:
- `src/lib/chat/task-runner.ts`
- `src/app/api/chat/tasks/route.ts`
- `src/app/api/chat/tasks/[id]/route.ts`
- `src/app/api/chat/tasks/[id]/events/route.ts`
- `src/app/api/chat/tasks/[id]/approve/route.ts`
- `src/app/api/chat/tasks/[id]/retry/route.ts`
- `src/app/api/chat/tasks/[id]/cancel/route.ts`

Current behavior:
- Supports create/list/get/events/approve/retry/cancel.
- Creates child isolated chat sessions for delegated tasks.
- Persists task steps and state transitions.

Readiness:
- API/runtime is active with autonomous worker execution.
- Queued approved tasks execute via worker with progress/heartbeat/dead-letter semantics.

### 4) Skills Lifecycle

Files:
- `src/app/api/companies/[id]/agent/skills/*`
- `src/app/api/tools/data/skills/route.ts`
- `src/lib/skills/*`

Current behavior:
- Supports create, learn, install, update env, share, import, uninstall.
- Syncs skills to agent files and tracks install status by agent type.
- Includes execution logging and skill status reporting.

Readiness:
- Ready for orchestrated skill operations.
- Requires explicit flow templates and budget metadata for consistent multi-step execution.

### 5) UI Runtime Surfaces

Files:
- `src/lib/hooks/use-streaming-chat.ts`
- `src/components/chat/chat-message.tsx`
- `src/components/chat/task-card.tsx`

Current behavior:
- Renders tool and task cards from SSE.
- Supports approve/reject/retry actions.

Readiness:
- Ready with flow-budget and task health indicators.
- Includes stalled/dead-letter hints and delegated task lifecycle visualization.

## Core Risks

- Long-horizon delegated objectives are currently single-cycle per worker invocation.
- Nested delegation depth is intentionally bounded for safety (`MAX_AUTONOMOUS_DEPTH`).
- Flow quality still depends on model output quality and policy-constrained tool availability.

## Operational Guidance

- Use P0 tool-first flows for deterministic behavior.
- Gate high-risk or long-run plans through task approval.
- Enforce max action budgets and explicit stop behaviors.
- Run periodic task health sweeps to dead-letter stale queued/running work.
