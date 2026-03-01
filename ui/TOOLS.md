# TOOLS.md

Version: 1.0
Status: Active
Scope: Blitzscale OS UI agent runtime

## Purpose

This document is the source of truth for tool and task execution in the Blitzscale agent system.
It defines:

- how agents invoke tools and delegate tasks,
- which tools are allowed per agent type,
- approval and safety requirements,
- endpoint contracts for implementation.

Use this document for:

- `SOUL.md`/prompt authoring,
- backend endpoint implementation,
- frontend task/tool rendering,
- QA test scenarios.

## Core Rules

- Every operation must be scoped to `companyId`.
- Tool calls must be structured JSON directives.
- High-risk actions must require approval before execution.
- All tool/task actions should be auditable.
- Tool handlers must return structured JSON, never plain prose only.

## Directive Protocol

Legacy `TOOL:/PARAMS:` blocks are deprecated. Use structured directives only.

### Tool directive

```xml
<tool_call>{"tool":"search_documents","params":{"query":"fintech icp","limit":5}}</tool_call>
```

### Task directive

```xml
<task_call>{"agentType":"campaigns","objective":"Draft launch sequence for Q2 ICP","inputs":{"campaignId":"cmp_123"},"priority":"high","requiresApproval":true}</task_call>
```

### Optional action budget directive

```xml
<action_budget>{"maxActions":8,"hardStopBehavior":"summarize","flowId":"FlowA_ResearchToKnowledge"}</action_budget>
```

- `maxActions`: hard cap on directive actions for this response cycle.
- `hardStopBehavior`:
  - `summarize` -> stop and return summary.
  - `ask_approval` -> stop and request approval to continue.
  - `abort` -> stop and fail flow execution.
- `flowId`: optional canonical flow contract ID.

### Optional stable step metadata

For both `tool_call` and `task_call`, include when possible:

- `flowId`
- `stepId`
- `attempt`

### Optional fenced format

```agent-actions
{
  "directives": [
    { "tool": "list_campaigns", "params": { "limit": 10 } },
    {
      "agentType": "research",
      "objective": "Research top 20 competitors in HR tech",
      "inputs": { "region": "US" },
      "priority": "normal",
      "requiresApproval": false
    }
  ]
}
```

## Runtime Event Contract (SSE)

The chat orchestrator may emit:

- `content`
- `reasoning-start`
- `reasoning`
- `reasoning-end`
- `tool`
- `tool.started`
- `tool.succeeded`
- `tool.failed`
- `task.created`
- `task.progress`
- `task.heartbeat`
- `task.delegated`
- `task.completed`
- `task.failed`
- `approval.requested`
- `flow.started`
- `flow.budget`
- `flow.stopped`
- `flow.completed`
- `task.heartbeat`
- `done`
- `error`

All event payloads should include stable IDs when possible (`taskId`, `sessionId`).

## Agent Types

Supported types:

- `main`
- `campaigns`
- `crm`
- `inbox`
- `research`
- `knowledge`

## Policy Matrix

### main

Allowed tools:

- `create_document`
- `update_document`
- `search_documents`
- `get_document`
- `get_document_with_context`
- `list_tags`
- `list_campaigns`
- `get_campaign_details`
- `list_knowledge_docs`
- `get_knowledge_doc`
- `create_knowledge_doc`
- `update_knowledge_doc`
- `delete_knowledge_doc`
- `research_topic`

### campaigns

Allowed tools:

- `list_campaigns`
- `get_campaign_details`
- `research_topic`

### crm

Allowed tools:

- `research_topic`
- `list_knowledge_docs`
- `get_knowledge_doc`

### inbox

Allowed tools:

- `search_documents`
- `get_document`
- `research_topic`

### research

Allowed tools:

- `research_topic`
- `search_documents`
- `get_document`
- `list_tags`
- `list_knowledge_docs`
- `get_knowledge_doc`

### knowledge

Allowed tools:

- `create_document`
- `update_document`
- `search_documents`
- `get_document`
- `get_document_with_context`
- `list_tags`
- `list_knowledge_docs`
- `get_knowledge_doc`
- `create_knowledge_doc`
- `update_knowledge_doc`
- `delete_knowledge_doc`

## Core Endpoints

### Chat Orchestrator

- `POST /api/chat`
  - Auth: user session
  - Required body: `message`, `companyId`
  - Optional: `sessionId`, `sessionType`, `componentContext`, `stream`
  - Returns: SSE when `stream=true`

### Chat Sessions

- `GET /api/chat/sessions?companyId=<id>&sessionType=<type>`
- `POST /api/chat/sessions`
- `DELETE /api/chat/sessions?id=<sessionId>&hard=true|false`

### Chat Messages

- `GET /api/chat/messages?sessionId=<id>&page=1&limit=50`

### Task Runtime

- `GET /api/chat/tasks?sessionId=<id>`
- `POST /api/chat/tasks`
- `GET /api/chat/tasks/:id`
- `GET /api/chat/tasks/:id/events`
- `POST /api/chat/tasks/:id/cancel`
- `POST /api/chat/tasks/:id/approve` with `{ "decision": "approved" | "rejected" }`
- `POST /api/chat/tasks/:id/retry`
- `POST /api/chat/tasks/sweep` with `{ "companyId": "<uuid>" }` for stalled/dead-letter sweeps

### Tool Gateway

- `GET /api/tools?agentType=<type>`
  - Returns filtered catalog + policy metadata
- `POST /api/tools`
  - Required body: `tool`, `params`, `companyId`, `sessionKey`
  - Optional: `agentType`, `sessionId`

## Existing Tool Families (Agent-Facing Data APIs)

These routes are available for proxied agent workflows (usually with `x-agent-token` on direct agent calls):

- `GET /api/tools/data/campaigns`
- `GET /api/tools/data/events`
- `POST /api/tools/data/events`
- `GET /api/tools/data/inbox/messages`
- `POST /api/tools/data/inbox/messages/tag-batch`
- `GET /api/tools/data/knowledge`
- `GET /api/tools/data/skills`
- `POST /api/tools/data/skills`
- `GET /api/tools/inboxing/domains`
- `GET /api/tools/inboxing/health`

## Knowledge Tool Contract

### create_document

- Params: `title`, `content`, optional `primary_tag`, `secondary_tags`, `type`, `derived_from`, `related_to`
- Side effects: creates Supermemory memory + cache row sync

### update_document

- Params: `document_id`, optional updates for content/title/tags/relationships
- Side effects: document update + cache sync + version metadata increment

### search_documents

- Params: `query`, optional filters (`primary_tag`, `secondary_tags`, `limit`)
- Side effects: none (read-only)

### get_document

- Params: `document_id`
- Side effects: none (read-only)

### get_document_with_context

- Params: `document_id`
- Side effects: none (read-only)

### list_tags

- Params: none
- Side effects: none (read-only)

## Generic Tool Response Shape

Success:

```json
{
  "ok": true,
  "tool": "search_documents",
  "data": { "count": 3, "results": [] },
  "durationMs": 42
}
```

Failure:

```json
{
  "ok": false,
  "tool": "search_documents",
  "error": "Tool search_documents is not allowed for agent type campaigns",
  "durationMs": 3
}
```

## Task Contract

### Create task request

```json
{
  "companyId": "uuid",
  "parentSessionId": "uuid",
  "agentType": "campaigns",
  "objective": "Prepare campaign launch package",
  "inputs": { "campaignId": "cmp_123" },
  "priority": "high",
  "requiresApproval": true,
  "flowId": "FlowD_ApprovalGatedLaunchPrep",
  "stepId": "step_1",
  "attempt": 1,
  "maxActions": 10,
  "actionsUsed": 2,
  "hardStopBehavior": "ask_approval"
}
```

### Task record shape

```json
{
  "id": "uuid",
  "company_id": "uuid",
  "parent_session_id": "uuid",
  "child_session_id": "uuid",
  "agent_type": "campaigns",
  "objective": "Prepare campaign launch package",
  "status": "blocked",
  "progress": 0,
  "current_step": "Waiting for approval",
  "requires_approval": true,
  "approval_status": "pending",
  "flow_id": "FlowD_ApprovalGatedLaunchPrep",
  "step_id": "step_1",
  "attempt": 1,
  "max_actions": 10,
  "actions_used": 2,
  "hard_stop_behavior": "ask_approval",
  "worker_heartbeat_at": "2026-02-25T10:22:00.000Z",
  "dead_lettered_at": null
}
```

### Status lifecycle

- `queued` -> `running` -> `completed`
- `queued` -> `running` -> `failed`
- `blocked` -> `queued` (approved)
- `blocked` -> `cancelled` (rejected)
- `failed` -> `queued` (retry)
- `running` -> `blocked` (budget stop with `ask_approval`)
- `queued` -> `failed` (dead-letter when stale)
- `running` -> `failed` (dead-letter when heartbeat stale)

## Approval Policy

Approval is required by default for:

- campaign publish/activate,
- outbound sending actions,
- bulk write operations,
- destructive operations (delete/archive at scale).

Approval resolution endpoint:

- `POST /api/chat/tasks/:id/approve`

Valid decisions:

- `approved`
- `rejected`

## Observability

### Tool telemetry

Tool calls should be logged to `tool_invocations` with:

- `company_id`, `session_id`, `tool_name`, `status`, `duration_ms`,
- input params summary and output summary when safe.

### Task telemetry

Task lifecycle should be persisted in:

- `agent_tasks`
- `agent_task_steps`
- `agent_approvals`
- `agent_artifacts`

Task health and worker signals:

- `task.progress` includes worker progress states.
- `task.heartbeat` indicates active worker runtime.
- `task.dead_lettered` marks stale tasks moved to failed dead-letter state.

### Flow telemetry

Flow budget telemetry should be persisted in `agent_decisions` with:

- `flow_id`, `max_actions`, `actions_used`, `hard_stop_behavior`
- `event`: `flow_started`, `flow_budget`, `flow_stopped`, `flow_completed`

### Optional memory telemetry

Use existing:

- `chat_snapshots`
- `agent_decisions`

for long-session retention and reasoning continuity.

## Feature Flags

Environment flags used by runtime:

- `FF_CHAT_STRUCTURED_DIRECTIVES` (default `true`)
- `FF_CHAT_TASK_RUNTIME` (default `true`)
- `FF_CHAT_INBOX_UNIFIED` (default `true`)

## Preset Flow Contracts

Canonical flow IDs and action budgets:

- `FlowA_ResearchToKnowledge` (6)
- `FlowB_CampaignReadout` (7)
- `FlowC_InboxContextAssist` (6)
- `FlowD_ApprovalGatedLaunchPrep` (10)
- `FlowE_MultiAgentMarketSprint` (12)
- `FlowF_LearnInstallShare` (12)
- `FlowG_SkillHealthRemediation` (8)

## Idempotency and Retry

- All external mutation tools should support idempotency keys where possible.
- Retry only failed/cancelled tasks via `POST /api/chat/tasks/:id/retry`.
- Do not auto-retry destructive operations without explicit policy.

## Backward Compatibility

- Legacy `TOOL:/PARAMS:` parsing is deprecated and should not be used in prompts.
- Existing route-level tool APIs remain supported during migration.
- UI surfaces should prefer shared streaming protocol for consistency.

## Testing Checklist

- Agent can call allowed tools for its type.
- Agent is blocked from disallowed tools.
- Task creation works and child session is linked.
- Approval required tasks emit `approval.requested`.
- Approve/reject updates task state correctly.
- Retry transitions failed task back to queued.
- Chat UI renders tool cards, task cards, and state transitions.
