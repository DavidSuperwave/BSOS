# Autonomous Sub-Agent Runtime

Last updated: 2026-02-25
Status: Active

## What changed

The task worker is now an autonomous delegated execution runtime, not a placeholder completion path.

Implemented behavior:

1. Claim queued delegated task (`agent_tasks.status=queued` -> `running`).
2. Resolve execution context (company container, mapped company agent, session key, recent history).
3. Build delegated prompt and system prompt (includes directive protocol and preset flow guidance).
4. Execute delegated objective against OpenClaw (`chatSend`).
5. Parse delegated output directives.
6. Execute tool directives through `executeGatewayTool` under agent policy constraints.
7. Execute task directives by creating nested delegated tasks (bounded depth).
8. Apply action-budget stop behavior (`summarize`, `ask_approval`, `abort`).
9. Persist outputs and tool calls to child session messages.
10. Emit progress, heartbeat, and completion/failure events.

## Files

- Runtime worker:
  - `src/lib/chat/task-worker.ts`
- Task state APIs:
  - `src/lib/chat/task-runner.ts`
  - `src/app/api/chat/tasks/[id]/approve/route.ts`
  - `src/app/api/chat/tasks/[id]/retry/route.ts`
  - `src/app/api/chat/tasks/sweep/route.ts`
- Chat orchestrator integration:
  - `src/app/api/chat/route.ts`

## Runtime guarantees

- Company scoping is preserved for all delegated tool execution.
- Tool permissions remain enforced by `TOOL_POLICIES`.
- Nested delegation is bounded (`MAX_AUTONOMOUS_DEPTH`).
- Stale queued/running tasks can be dead-lettered via sweep.

## Task lifecycle additions

- Worker heartbeat updates (`worker_heartbeat_at` + `task.heartbeat` event).
- Dead-letter states (`dead_lettered_at` + `task.dead_lettered` step).
- Flow/budget metadata tracked in task records:
  - `flow_id`, `step_id`, `attempt`
  - `max_actions`, `actions_used`, `hard_stop_behavior`

## Known limits

- Current worker loop is single-cycle per task invocation (deterministic and bounded).
- Long-horizon autonomous planning can be extended later by multi-cycle continuation policies.

## Upstream alignment

Design aligns with OpenClaw/Ironclaw-style delegated session execution model:
- [DenchHQ/ironclaw](https://github.com/DenchHQ/ironclaw)
