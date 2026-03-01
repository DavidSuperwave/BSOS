# Chat Dashboard Changes

This document summarizes the updates made to the chat dashboard UI on the main route (`/`), including the newly added mode toggle button.

## Scope Requested

- Add the button only.
- Provide documentation of what changed and what was added to the chat dashboard.

## New Button Added

- Added a `Chat / Research` segmented toggle button in the Perplexity-style composer.
- Location:
  - `src/components/chat/chat-input.tsx`
  - Rendered inside the bottom-right control cluster of the Perplexity composer variant.

### Behavior

- The toggle is interactive and maintains active state.
- `Chat` and `Research` are mutually exclusive.
- The selected mode is surfaced to the parent via `onModeChange`.
- Parent wiring is in:
  - `src/app/page.tsx`
  - Stores mode in local state and passes it back into `ChatInput` through `modeLabel`.

## Chat Dashboard Context (Already Present)

The current chat dashboard implementation on `/` includes:

- Headerless shell for the route (`hideHeader` in `AppShell` usage).
- Perplexity-like white composer variant.
- Right-side session history panel (`SessionSidebar`) retained.
- In-chat activity panel support for background agent tasks.

## Files Touched For This Request

- `src/components/chat/chat-input.tsx`
  - Added `modeLabel` type narrowing (`"Chat" | "Research"`).
  - Added `onModeChange` callback prop.
  - Replaced generic mode dropdown with a dedicated segmented `Chat / Research` toggle button.

- `src/app/page.tsx`
  - Added `chatMode` state.
  - Connected `chatMode` to `ChatInput` via `modeLabel`.
  - Connected `setChatMode` to `ChatInput` via `onModeChange`.

## Notes

- This change only adds and wires the button state in the UI.
- Routing behavior (`Chat` -> Kimi K2 path, `Research` -> Perplexity path) is not switched by this button yet in backend request flow.
- If needed, the next step is to route submit behavior based on `chatMode`.

---

## Phase 2 Additions (Vault + Prompt Wiring)

This section documents the latest additions made after the initial dashboard mode toggle work.

### 1) Vault Selector in Chat Composer

Added a Vault selection flow to the Perplexity-style chat input so users can reference stored knowledge documents directly from chat.

- File: `src/components/chat/chat-input.tsx`
- New UI:
  - `Vault` button in composer actions
  - `Vault documents` option in the `+` menu
  - Searchable document popover
  - Multi-select with check indicators
  - Selected document chips rendered above the input
- Send behavior:
  - Selected docs are included in `onSend(..., { referencedDocs })`

### 2) Vault Data Wiring from Chat Page

Wired document data into `ChatInput` on the main chat route.

- File: `src/app/page.tsx`
- Changes:
  - Uses `useSupermemoryDocuments(companyId, "all")`
  - Normalizes documents for picker display (id/title/updatedAt)
  - Passes `vaultDocuments` and `vaultLoading` into `ChatInput`
  - Passes selected references into `sendMessage` via `componentContext.data.vaultReferences`

### 3) System Prompt Enrichment (Main Chat)

Wired Vault references and knowledge tool visibility into the chat prompt builder.

- File: `src/app/api/chat/route.ts`
- Added:
  - Knowledge tool descriptions for `main` / `knowledge` chat sessions
  - Vault reference injection into prompt under:
    - `## REFERENCED VAULT DOCUMENTS`
  - Best-effort document fetch from Supermemory (`/memories/:id`) for short excerpts
  - Company-scope guardrails and fallback behavior (id/title only if content fetch is unavailable)

### 4) Menu UX Improvements (Click Outside to Close)

Improved dropdown behavior so menus close when clicking outside instead of requiring a second button click.

- File: `src/components/chat/chat-input.tsx`
- Applies to:
  - `+` menu
  - `Vault` menu
  - `Options` menu
  - Slash command menu

### 5) Agent Activity Panel Temporarily Disabled

Hidden for now until it is driven by real tool/search activity (instead of fallback placeholders).

- File: `src/app/page.tsx`
- Added feature toggle:
  - `ENABLE_AGENT_ACTIVITY_PANEL = false`

---

## Runtime / Architecture Notes

- Tool execution flow already exists and remains unchanged:
  - Agent emits structured directives
  - Parsed by `parseAgentDirectives`
  - Executed by `executeAssistantDirectives` + `executeGatewayTool`
- Legacy `TOOL:/PARAMS:` parsing was intentionally not added.

---

## Docker Build Status

- `Dockerfile` build stage runs `npm run build` (`next build`).
- Current repository build still fails due pre-existing lint/type issues in unrelated files.
- The Vault + prompt wiring changes themselves do not introduce new lint errors in edited files.

---

## Next Step: Move Into Dashboard Component

When moving this chat surface into a dedicated dashboard component, carry these interfaces forward:

1. `ChatInput` props for Vault:
   - `vaultDocuments`
   - `vaultLoading`
   - `onSend(message, { referencedDocs })`
2. Page/container responsibility:
   - fetch + normalize vault docs
   - pass referenced docs into `componentContext`
3. API responsibility:
   - build system prompt with tool descriptions + referenced vault context

Recommended migration approach:
- Move container logic from `src/app/page.tsx` into the target dashboard component first.
- Keep `ChatInput` unchanged to preserve UX.
- Validate end-to-end with:
  - selecting docs in Vault picker
  - asking for summary of selected docs
  - running create/search document tool requests.

---

## Related Documents

- **CHAT_DASHBOARD_TEST_TRACKER.md** — Testing checklist for all Phase 2 changes
  - Vault selector tests
  - Mode toggle tests  
  - Menu UX tests
  - API prompt wiring verification
  - End-to-end scenarios

---

*Last Updated: February 26, 2026*
