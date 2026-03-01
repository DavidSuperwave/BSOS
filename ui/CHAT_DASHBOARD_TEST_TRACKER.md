# Chat Dashboard Test Tracker
## Phase 2 Testing Checklist

**Created:** 2026-02-26  
**Context:** Working alongside Cursor — tracking UI changes that need testing

---

## 🔧 Components Ready for Testing

### 1. Vault Selector in Chat (`ChatInput`)

| Test Case | Status | Notes |
|-----------|--------|-------|
| Click `Vault` button → menu opens | ⏳ Untested | |
| Click `+` menu → select "Vault documents" | ⏳ Untested | |
| Search vault documents filters list | ⏳ Untested | |
| Select multiple documents (checkmarks) | ⏳ Untested | |
| Selected docs show as chips above input | ⏳ Untested | |
| Click chip X removes selection | ⏳ Untested | |
| Vault menu closes on outside click | ⏳ Untested | |
| Send includes `referencedDocs` in options | ⏳ Untested | Check `onSend` callback |

**File:** `src/components/chat/chat-input.tsx`

---

### 2. Vault Data Wiring (`page.tsx` → `ChatInput`)

| Test Case | Status | Notes |
|-----------|--------|-------|
| Vault documents load on page mount | ⏳ Untested | Check `useSupermemoryDocuments` |
| Loading state shows spinner | ⏳ Untested | `vaultLoading` prop |
| Documents normalize (id/title/updatedAt) | ⏳ Untested | |
| Empty vault shows "No documents found" | ⏳ Untested | |
| Selected docs pass to `sendMessage` | ⏳ Untested | In `componentContext.data.vaultReferences` |

**File:** `src/app/page.tsx`

---

### 3. Chat/Research Mode Toggle

| Test Case | Status | Notes |
|-----------|--------|-------|
| Toggle switches between Chat/Research | ⏳ Untested | Visual state change |
| `onModeChange` fires with correct value | ⏳ Untested | Check parent state |
| Mode persists during session | ⏳ Untested | |
| `[Research]` prefix added to message | ⏳ Untested | In `handleSubmit` |

**Files:** `src/components/chat/chat-input.tsx`, `src/app/page.tsx`

---

### 4. Menu Click-Outside Behavior

| Test Case | Status | Notes |
|-----------|--------|-------|
| `+` menu closes on outside click | ⏳ Untested | |
| `Vault` menu closes on outside click | ⏳ Untested | |
| `Options` menu closes on outside click | ⏳ Untested | |
| Slash command menu closes on outside click | ⏳ Untested | |
| Slash command menu closes on Escape | ⏳ Untested | |

**File:** `src/components/chat/chat-input.tsx`

---

### 5. System Prompt Wiring (API)

| Test Case | Status | Notes |
|-----------|--------|-------|
| Knowledge tool descriptions in prompt | ⏳ Untested | For `main`/`knowledge` session types |
| Vault references injected into prompt | ⏳ Untested | Under `## REFERENCED VAULT DOCUMENTS` |
| Document content fetched from Supermemory | ⏳ Untested | `/memories/:id` call |
| Fallback to id/title if fetch fails | ⏳ Untested | Error handling |
| Company scope guardrails work | ⏳ Untested | Verify container tag isolation |

**File:** `src/app/api/chat/route.ts`

---

### 6. Agent Activity Panel

| Test Case | Status | Notes |
|-----------|--------|-------|
| Panel is hidden (`ENABLE_AGENT_ACTIVITY_PANEL = false`) | ✅ Confirmed | Toggle set in `page.tsx` |
| No fallback placeholder tasks show | ⏳ Untested | Verify when `isStreaming=true` |

**File:** `src/app/page.tsx`

---

## 🧪 End-to-End Test Scenarios

### Scenario 1: Vault Document Reference
```
1. Open chat
2. Click Vault button
3. Select 2 documents from list
4. Type: "Summarize these documents"
5. Send
6. Verify: Agent receives vault context in prompt
```
**Status:** ⏳ Untested

### Scenario 2: Knowledge Tool Usage
```
1. Open chat
2. Type: "Create a document about our ICP"
3. Send
4. Verify: Agent responds with tool call or confirmation
5. Verify: Document created in Supermemory
```
**Status:** ⏳ Untested

### Scenario 3: Chat/Research Mode Switch
```
1. Toggle to Research mode
2. Type: "Analyze the SaaS market"
3. Send
4. Verify: Message prefixed with [Research]
5. Verify: Routes to Perplexity endpoint (when wired)
```
**Status:** ⏳ Untested

### Scenario 4: Menu UX
```
1. Click + menu
2. Click outside menu
3. Verify: Menu closes
4. Repeat for Vault, Options menus
```
**Status:** ⏳ Untested

---

## 🐛 Known Issues / Blockers

| Issue | Location | Impact | Workaround |
|-------|----------|--------|------------|
| Docker build fails (pre-existing lint errors) | Unrelated files | Can't deploy | Fix lint errors in separate branch |
| Research mode doesn't route to Perplexity yet | `page.tsx` | Research toggle is UI-only | Wire `chatMode` to API endpoint selection |
| Tool execution flow uses structured directives | `chat/route.ts` | Agent must emit JSON directives | Document expected format for Cursor |

---

## ✅ Sign-Off Checklist

Before merging to main:
- [ ] All Vault selector tests pass
- [ ] All mode toggle tests pass
- [ ] All menu UX tests pass
- [ ] API prompt wiring verified (check logs)
- [ ] E2E Scenario 1 passes
- [ ] E2E Scenario 4 passes
- [ ] No new console errors
- [ ] Mobile responsive (quick check)

---

## 📝 Notes for Cursor Collaboration

**Current State:**
- UI components are built and wired
- Data flow from page → ChatInput is complete
- API prompt enrichment is implemented
- Tool execution infrastructure exists

**Next Cursor Tasks:**
1. Fix pre-existing lint errors (blocking Docker build)
2. Wire `chatMode` to actual API endpoint routing (Chat → `/api/chat`, Research → `/api/perplexity/research`)
3. Test tool execution with actual knowledge tool calls
4. Add loading states for tool execution

**Testing Priority:**
1. Vault picker functionality (highest — new UI)
2. Prompt wiring (high — affects agent behavior)
3. Menu UX (medium — polish)
4. Mode toggle routing (medium — pending endpoint wiring)

---

*Last Updated: 2026-02-26*
