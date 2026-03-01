# Blitzscale OS - Build Changelog & Architecture

## Session Overview

This document covers the complete set of changes made during the Phase 1-2 build session, including the deployment status screen, multi-tenant data scoping audit, Supabase configuration, SSH provisioning fixes, and chat agent connectivity.

---

## Phase 1: Deployment Status Screen

### What was built

When a user clicks "Deploy Agent" on the final onboarding step, instead of immediately redirecting, the app now:

1. Saves config + deploys the AI agent configuration
2. Fires off container provisioning (starts Docker container on the droplet)
3. Shows an animated deployment status screen with progress stages
4. Polls container status every 4s until it's running or errors
5. On success: shows green checkmark, redirects to dashboard after 2.5s
6. On error: shows error message with retry button

### Files created

| File | Purpose |
|------|---------|
| `src/lib/hooks/use-container-status.ts` | SWR polling hook that hits `/api/companies/[id]/container-status` every 4s when enabled. Passes `null` key to SWR when disabled to prevent unnecessary requests. |
| `src/components/onboarding/deployment-status.tsx` | Deployment progress screen with 4 visual stages that advance on timers (0s/12s/22s/32s). States: saving, provisioning, success, error. Includes pulsing rocket animation, LoadingDots component, success checkmark, and error with retry button. |

### Files modified

| File | Changes |
|------|---------|
| `src/app/onboarding/page.tsx` | Added `deploying`, `deployPhase`, `deployError` state. Added `useContainerStatus` hook activated during provisioning. `runDeploy()` saves config, calls deploy-agent, calls provision, polls until running. Renders `<DeploymentStatus>` when deploying instead of wizard steps. Agent provisioning moved from step 0 to after container is confirmed running. |
| `src/components/onboarding/wizard-shell.tsx` | Added `deploying?: boolean` prop. When deploying: header shows "Deploying", step counter hidden, all progress bars filled green, navigation footer hidden. |

---

## Phase 2: Multi-Tenant Data Scoping Audit

### Problem

The dashboard was showing real PlusVibe data (Active Leads: 7) despite no company existing in the new Supabase instance. API routes were pulling credentials directly from `.env.local` global environment variables instead of per-company credentials.

### Root cause

- 6 API routes used global `envConfig` for API keys instead of per-company credentials
- 11 of 14 SWR hooks fired requests without waiting for `companyId` to be available
- No isolation between companies for third-party API access

### Fix: Per-company credential resolution

**Created `src/lib/company-credentials.ts`** - Centralized credential resolver that:
1. Checks the company's `integration_credentials` JSONB column in the `companies` table
2. Falls back to global env vars as defaults
3. Returns a typed `CompanyCredentials` object

### SWR hooks fixed (`src/lib/hooks.ts`)

All 11 hooks now pass `null` as the SWR key when `companyId` is missing, preventing any fetch:

- `useDashboardMetrics` - `useCampaigns` - `useKnowledgeBase` - `useApiStatus`
- `useInboxMessages` - `useEmailTags` - `useInboxingDomains` - `useInboxingHealth`
- `useRegistrars` - `usePlatformConnections` - `useChatSessions`

Pattern: `useApiData<T>(companyId ? \`/api/...?companyId=\${companyId}\` : null)`

### API routes fixed

| Route | Change |
|-------|--------|
| `src/app/api/dashboard/metrics/route.ts` | Requires `companyId` query param. Uses `getCompanyCredentials(companyId)`. |
| `src/app/api/calendly/events/route.ts` | Requires `companyId` query param. Uses per-company Calendly key + user URI. |
| `src/app/api/perplexity/research/route.ts` | Accepts optional `companyId` in POST body. Uses per-company Perplexity key. |
| `src/app/api/settings/status/route.ts` | Requires `companyId` query param. Reports per-company integration status. |

### UI fix

`src/components/Settings.tsx` - Changed `useApiStatus()` to `useApiStatus(selectedCompany?.id)`.

### Signup fix

`src/app/(auth)/signup/page.tsx` - Changed `router.push("/")` to `router.push("/onboarding")` to eliminate race condition where middleware hadn't yet detected the new user's account.

---

## Phase 3: Supabase Configuration

### Issues found and fixed

1. **Wrong anon key format** - `.env.local` had `sb_publishable_...` instead of a proper JWT. User updated to correct JWT format.

2. **Missing RLS policies** - PostgREST returned 406 errors because RLS policies only existed for `service_role`, not `authenticated`. Added via Supabase MCP migrations:
   - `account_members`: SELECT policy for authenticated users where `user_id = auth.uid()`
   - `accounts`: SELECT policy for authenticated users via account_members join
   - `companies`: SELECT policy for authenticated users via account_members join (this was the redirect-to-dashboard blocker)

3. **Missing user account** - No `accounts` or `account_members` rows existed for the user in the new Supabase. Created via SQL insert.

4. **Orphaned seed company** - An old "Superwave" company blocked slug creation (409 conflict). Deleted.

5. **Missing columns** - `icp` and `pain_points` JSONB columns didn't exist on `companies` table. Added via migration.

---

## Phase 4: SSH Provisioning (Windows Fix)

### Problem

Container provisioning from the Next.js API route failed with `"Load key: error in libcrypto"`. The `sshExec` function wrote the SSH private key to a temp file and called `ssh` via `child_process.execSync`. On Windows:
- `fs.writeFileSync` with `mode: 0o600` has no effect (NTFS doesn't use Unix permissions)
- Windows OpenSSH rejects key files without proper NTFS ACL restrictions
- `icacls` workaround was attempted but unreliable

### Solution

Replaced the entire approach with the `ssh2` npm package, which handles SSH connections natively in Node.js memory. No temp files, no file permissions, no platform-specific workarounds.

### Files changed

| File | Change |
|------|--------|
| `src/lib/ssh.ts` | **Created** - Shared SSH utility using `ssh2.Client`. Passes private key directly as a string. Normalizes line endings (`\r\n` to `\n`). |
| `src/app/api/companies/[id]/provision/route.ts` | Imports `sshExec` from `@/lib/ssh` instead of inline implementation. Removed all `child_process`, `fs`, `os`, `path` imports. |
| `src/app/api/companies/[id]/container-status/route.ts` | Same — replaced `execSync` + temp file SSH with `sshExec` from `@/lib/ssh`. |
| `next.config.js` | Added `experimental.serverComponentsExternalPackages: ["ssh2"]` to prevent webpack from bundling the native `.node` binary. |
| `package.json` | Added `ssh2` + `@types/ssh2` dependencies. |

---

## Phase 5: Chat Agent Connectivity

### Problem 1: Chat route used wrong URL

`/api/chat/route.ts` hardcoded `envConfig.openclaw.url()` which resolved to `http://localhost:18789`. The actual OpenClaw instances run on the DigitalOcean droplet at `http://159.65.220.183:<port>`.

### Fix

The chat route now:
1. Looks up the company's `container_url` from the database
2. Validates the container is in `running` state
3. Passes the container URL to `streamChatCompletion` and `blockingChatCompletion`

### Problem 2: No agent records

The `company_agents` table was empty. During onboarding, the agent provisioning API (`/api/companies/[id]/agents/provision`) was called at step 0 — before the container existed. It tried to call OpenClaw RPC to create agents, failed silently, and never inserted DB records.

### Fix

- Moved agent provisioning from onboarding step 0 to `runDeploy()`, after container provisioning confirms the container is running
- Agent records are now created post-provisioning

### Problem 3: Container OOM

OpenClaw crashed with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`. The docker-compose had `memory: 512M` which wasn't enough.

### Fix

- Removed Docker memory limits from `generateDockerCompose`
- Added `NODE_OPTIONS=--max-old-space-size=2048` to container environment variables
- Droplet has 3.8GB RAM with ~2.9GB available

### Error handling improvement

`src/lib/hooks/use-streaming-chat.ts` - Now parses the error response body and shows the actual API error message instead of just `HTTP error! status: 400`. Also guards against sending when `companyId` is empty.

---

## Phase 6: OpenClaw WebSocket Protocol — The Hard Part

This phase consumed the bulk of the engineering effort. What seemed like a straightforward "connect chat UI to backend" turned into a deep investigation of OpenClaw's internal architecture and several failed networking approaches before landing on a working solution.

### Discovery: OpenClaw Has No HTTP API

The initial chat route used `fetch()` to POST to `/v1/chat/completions` on the container URL. This returned **405 Method Not Allowed**. Investigation revealed:

- OpenClaw's gateway is **WebSocket-only**. There is no REST/HTTP endpoint for chat.
- The `chatCompletions.enabled: true` config doesn't create an HTTP endpoint — it's for something internal.
- Every GET route returns SPA HTML (a catch-all for the web UI).
- The gateway listens on `ws://127.0.0.1:18789` inside each container.
- All communication uses a custom JSON-RPC protocol over WebSocket.

**Decision**: Rewrite the entire chat backend from HTTP fetch to WebSocket RPC.

### Problem: Gateway Binds to Container-Internal Loopback

OpenClaw's gateway binds to `127.0.0.1:18789` — the container's own loopback interface, not the Docker bridge network. This means:

- **Docker port mapping doesn't work.** Even with `ports: ["18790:18789"]`, the docker-proxy connects from the bridge network (`172.18.0.1`), which the gateway silently rejects because it only accepts connections on `127.0.0.1`.
- From inside the container: `curl 127.0.0.1:18789` works.
- From the host via docker-proxy: empty response / connection reset.

### Failed Approach 1: Change Gateway Bind Address

Added `"host": "0.0.0.0"` to `openclaw.json` config and restarted the container. The gateway still showed `ws://127.0.0.1:18789` in its logs. The config field either doesn't control the WS gateway bind address or is ignored entirely. **Dead end.**

### Failed Approach 2: Docker Host Networking

Switched to `network_mode: "host"` so the container shares the host's network namespace directly. The gateway's `127.0.0.1` would be the host's `127.0.0.1` — accessible externally.

**Problem**: OpenClaw always binds to port 18789 regardless of configuration. With host networking, both containers share the same network namespace, so the second container fails with `"Port 18789 is already in use"`. Can't run multiple tenants this way. **Dead end.**

### Working Solution: Bridge Networking + socat + nsenter

Each container runs in its own bridge network (default Docker behavior), so each has its own `127.0.0.1:18789` that doesn't conflict. The challenge is reaching that address from outside the container.

**socat + nsenter** solves this:

```
Host 0.0.0.0:18790
  → socat TCP-LISTEN (on host)
  → nsenter --net=/proc/<container-PID>/ns/net (enters container's network namespace)
  → socat STDIO TCP:127.0.0.1:18789 (connects to gateway inside container)
```

Each company gets a systemd service:

```ini
[Service]
ExecStart=/bin/bash -c 'while true; do
  PID=$(docker inspect -f "{{.State.Pid}}" openclaw-supersauce 2>/dev/null);
  if [ -n "$PID" ] && [ "$PID" != "0" ]; then
    socat TCP-LISTEN:18791,fork,reuseaddr \
      SYSTEM:"nsenter --net=/proc/$PID/ns/net socat STDIO TCP\\:127.0.0.1\\:18789";
  fi;
  sleep 2;
done'
Restart=always
```

The outer `while true` loop handles container restarts (PID changes). The `fork` flag handles concurrent connections. The service auto-starts on boot.

**Why this approach**: It's the only way to reach a loopback-bound service inside a container without modifying the application binary, without host networking (which causes port conflicts), and without custom Docker network plugins.

### Problem: DigitalOcean Cloud Firewall

Even with socat listening on `0.0.0.0:18790`, the Next.js app running on Windows can't connect directly — the DigitalOcean cloud firewall blocks non-standard ports from external access.

**Solution**: SSH tunneling. The Next.js API route creates an SSH tunnel using `ssh2`'s `forwardOut()` to reach `127.0.0.1:18790` on the droplet (which is localhost from the droplet's perspective, bypassing the firewall).

The tunnel architecture:

```
Next.js API route (Windows)
  → ssh2 Client connects to droplet:22
  → forwardOut("127.0.0.1", 0, "127.0.0.1", 18790)
  → net.createServer (local TCP bridge on random port)
  → WebSocket connects to ws://127.0.0.1:<localPort>
  → Traffic flows: WS ↔ local bridge ↔ SSH tunnel ↔ socat ↔ nsenter ↔ container gateway
```

A `net.createServer` bridge is needed because the `ws` library doesn't support raw duplex streams directly — it needs a TCP socket.

### Problem: Protocol v3 Ed25519 Authentication

The existing `openclaw-client.ts` had a simplified handshake:

```json
{ "token": "...", "device": { "type": "api", "name": "blitzscale-ui" } }
```

Protocol v3 rejects this with: `"must have required property 'minProtocol'"`. The full handshake requires:

1. Server sends `connect.challenge` with a random `nonce`
2. Client generates a fresh Ed25519 keypair per connection
3. Client signs a payload: `v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce`
4. Client sends connect request with: `minProtocol`, `maxProtocol`, `client` (id, version, platform, mode), `role`, `scopes`, `caps`, `auth.token`, and `device` (id, publicKey, signature, signedAt, nonce)

The `deviceId` is derived from `SHA-256(rawPublicKey)`. The public key and signature are base64url-encoded.

**Decision**: Generate a fresh Ed25519 keypair for every connection. No need to persist keys since these are ephemeral server-to-server connections. Node.js `crypto.generateKeyPairSync('ed25519')` handles this natively.

### Problem: Per-Company Gateway Tokens

Each container's `OPENCLAW_GATEWAY_TOKEN` is set to the company's UUID during provisioning. The old code used a single global `GATEWAY_TOKEN()` from env vars.

**Fix**: `ChatSendParams` now accepts a `token` field. The chat route passes `companyId` as the token (since that's what was set as the gateway token in the container's env vars during provisioning).

### Problem: Missing sessionKey

After getting the handshake working, `chat.send` returned: `"must have required property 'sessionKey'"`. The RPC method requires a session identifier to maintain conversation context within OpenClaw.

**Fix**: `sessionKey` is now required in `ChatSendParams` (not optional). The chat route generates it as `company-${companyId}-${sessionId}` to scope sessions per-company.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/openclaw-client.ts` | Added `crypto` import. Added `b64url()`, `generateDeviceCredentials()`, `signChallenge()` helpers. Rewrote `performHandshake()` with full Ed25519 protocol v3. Added `token` to `ChatSendParams`, made `sessionKey` required. Updated `chatSend()` and `chatSendStream()` to use per-call token. |
| `src/app/api/chat/route.ts` | Added `gatewayToken = companyId`. Updated `streamChatCompletion` and `blockingChatCompletion` signatures to accept and pass `gatewayToken`. Fixed `blockingChatCompletion` to include `sessionKey` (was missing). |
| `src/app/api/companies/[id]/provision/route.ts` | Reverted from `network_mode: "host"` to bridge networking. Removed `openclaw.json` generation (not needed). Added `generateSocatService()` for systemd relay unit. Provisioning now creates socat service after container starts. File writes use base64 encoding to avoid heredoc escaping. Teardown now stops/removes socat service. |
| `next.config.js` | Added `"ws"` to `serverComponentsExternalPackages` alongside `"ssh2"`. |

### Scripts Created (exploratory / one-time use)

| Script | Purpose |
|--------|---------|
| `scripts/recreate-containers-host-network.js` | First attempt: host networking. Failed due to port conflicts. |
| `scripts/recreate-containers-v2.js` | Second attempt: host networking with per-port openclaw.json. Still port conflicts. |
| `scripts/recreate-containers-v3.js` | Working approach: bridge networking + socat relay. Used to set up the current containers. |

### Decision Log

| Decision | Options Considered | Chosen | Rationale |
|----------|--------------------|--------|-----------|
| Chat protocol | HTTP fetch, WebSocket RPC | WebSocket RPC | OpenClaw has no HTTP API. WS is the only option. |
| Container networking | Bridge + port map, Host networking, Bridge + socat | Bridge + socat | Port mapping fails (loopback bind). Host networking causes port conflicts. socat+nsenter is the only multi-tenant option. |
| External connectivity | Direct connection, SSH tunnel | SSH tunnel | DO firewall blocks non-standard ports. SSH tunnel bypasses this since port 22 is allowed. |
| Auth implementation | Simplified auth, Full Ed25519 protocol v3 | Full Ed25519 v3 | Simplified auth rejected by server. Protocol v3 is the minimum supported. |
| Device keys | Persistent keypair, Ephemeral per-connection | Ephemeral | Server-to-server; no need to persist device identity. Simpler, no key storage. |
| Gateway token scope | Global env var, Per-company from DB | Per-company | Multi-tenant requirement. Each container has its own token (company UUID). |
| File writes via SSH | Heredoc, Base64 encode | Base64 | Heredocs break with JSON containing `${}`, quotes, and special chars. Base64 is safe. |

---

## Current Architecture

### Droplet: 159.65.220.183

```
/opt/openclaw/
  superwaveio/          # Company: Supersauce (e11e1b5b...)
    docker-compose.yml  # Bridge networking, no port mapping
    agents/
  supersauce/           # Company: Superdunked (a29720a9...)
    docker-compose.yml  # Bridge networking, no port mapping
    agents/

/etc/systemd/system/
  socat-openclaw-superwaveio.service   # Relays 0.0.0.0:18790 → container 127.0.0.1:18789
  socat-openclaw-supersauce.service    # Relays 0.0.0.0:18791 → container 127.0.0.1:18789
```

### Running containers

| Container | Company | Host Port | Gateway Token | Networking |
|-----------|---------|-----------|---------------|------------|
| `openclaw-superwaveio` | Supersauce | 18790 (via socat) | `e11e1b5b-...` (company UUID) | Bridge |
| `openclaw-supersauce` | Superdunked | 18791 (via socat) | `a29720a9-...` (company UUID) | Bridge |

Each container's OpenClaw gateway binds to `127.0.0.1:18789` inside its own network namespace. The socat systemd service bridges external traffic into each container's namespace using `nsenter`.

### Database state (companies)

| Company | Slug | Container Status | Container URL | Port |
|---------|------|-----------------|---------------|------|
| superwave | superwave | none | - | - |
| Supersauce | superwaveio | running | http://159.65.220.183:18790 | 18790 |
| Superdunked | supersauce | running | http://159.65.220.183:18791 | 18791 |

### Database state (company_agents)

Both Supersauce and Superdunked have 4 agents each: `main`, `campaigns`, `crm`, `inbox`.

### Chat flow (detailed)

```
User sends message in UI
  → useStreamingChat hook sends POST /api/chat { message, companyId, sessionId }
  → Chat route authenticates user via Supabase
  → Looks up company.container_url + container_status from DB
  → Looks up company_agents for agent config by (companyId, sessionType)
  → Creates/resumes chat_session in DB
  → Saves user message to chat_messages

  → chatSendStream() in openclaw-client.ts:
    1. SSH tunnel: ssh2 forwardOut to 127.0.0.1:<port> on droplet
    2. Local TCP bridge: net.createServer pipes to SSH channel
    3. WebSocket: connects to ws://127.0.0.1:<localBridgePort>
    4. Ed25519 handshake:
       - Receives connect.challenge with nonce
       - Generates fresh Ed25519 keypair
       - Signs: v2|deviceId|cli|backend|operator|scopes|timestamp|token|nonce
       - Sends connect request with full protocol v3 params
    5. Sends chat.send RPC with { message, sessionKey, idempotencyKey }
    6. Streams chat events back as SSE

  → SSE stream proxied to client
  → On completion, assistant message saved to chat_messages in DB
```

### Provisioning flow

```
User clicks "Deploy Agent" in onboarding
  → POST /api/companies/[id]/deploy-agent (saves config)
  → POST /api/companies/[id]/provision
     → Allocates next available port (18790-18850)
     → Generates docker-compose.yml (bridge networking, env vars)
     → SSH to droplet: mkdir, write files (base64 encoded), docker compose up
     → Creates socat systemd service for port relay
     → systemctl enable + start socat service
     → Health check loop (5 retries, 5s delay via docker inspect)
     → Updates DB: container_status = "running"
  → POST /api/companies/[id]/agents/provision
     → Creates company_agents records in DB
     → Sets up OpenClaw workspace files (SOUL.md, TOOLS.md, AGENTS.md)
  → UI polls /api/companies/[id]/container-status every 4s
  → On "running" detected → success screen → redirect to /dashboard
```

### Teardown flow

```
DELETE /api/companies/[id]/provision
  → Stops and disables socat systemd service
  → Removes /etc/systemd/system/socat-<name>.service
  → systemctl daemon-reload
  → docker compose down -v
  → rm -rf /opt/openclaw/<slug>
  → Updates DB: container_status = "none", clears URL/port/name
```

### Key files summary

| File | Purpose |
|------|---------|
| `src/lib/openclaw-client.ts` | SSH-tunneled WebSocket RPC client with Ed25519 auth. Core functions: `createTunneledWs`, `performHandshake`, `chatSend`, `chatSendStream`. |
| `src/lib/ssh.ts` | Shared SSH utility (ssh2 library, in-memory key) |
| `src/lib/company-credentials.ts` | Per-company credential resolver |
| `src/lib/hooks/use-container-status.ts` | SWR polling hook for container status |
| `src/lib/hooks/use-streaming-chat.ts` | SSE streaming chat hook |
| `src/components/onboarding/deployment-status.tsx` | Deployment progress UI |
| `src/app/api/companies/[id]/provision/route.ts` | Container provisioning (bridge + socat + SSH + Docker) |
| `src/app/api/companies/[id]/container-status/route.ts` | Container health check |
| `src/app/api/chat/route.ts` | Chat API (routes to company container via WS RPC) |
| `next.config.js` | ssh2 + ws externalized for webpack |

### Network path diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (User)                                                 │
│    ↓ POST /api/chat (HTTPS)                                     │
├─────────────────────────────────────────────────────────────────┤
│  Next.js API Route (Windows / Vercel)                           │
│    ↓ ssh2 forwardOut                                            │
├─────────────────────────────────────────────────────────────────┤
│  SSH Tunnel (port 22)                                           │
│    ↓ TCP to 127.0.0.1:18790                                     │
├─────────────────────────────────────────────────────────────────┤
│  Droplet: socat TCP-LISTEN:18790                                │
│    ↓ nsenter --net=/proc/<PID>/ns/net                           │
├─────────────────────────────────────────────────────────────────┤
│  Container Network Namespace                                    │
│    ↓ socat STDIO TCP:127.0.0.1:18789                            │
├─────────────────────────────────────────────────────────────────┤
│  OpenClaw Gateway (ws://127.0.0.1:18789)                        │
│    ↓ Ed25519 handshake → chat.send RPC                          │
│    ↓ Routes to AI model via OpenRouter                          │
└─────────────────────────────────────────────────────────────────┘
```

### Environment dependencies

- **DigitalOcean Droplet**: 159.65.220.183, Docker 29.2.1, Compose v5.0.2
- **Droplet packages**: `socat` (installed for relay), `nsenter` (part of `util-linux`)
- **Docker Image**: ghcr.io/davidsuperwave/bsos/openclaw:latest
- **Supabase**: wmncawwcgnotizhowzii.supabase.co (30 tables, RLS enabled)
- **Port range**: 18790-18850 (61 max containers)
- **SSH**: Ed25519 key passed in-memory via ssh2 (no temp files)
- **npm packages added**: `ssh2`, `@types/ssh2`, `ws` (already present)

### Known Limitations / Future Work

- **Latency**: Every chat message creates a new SSH connection + WS handshake. Connection pooling or persistent tunnels would reduce this.
- **Single droplet**: All containers run on one droplet. Horizontal scaling would need a container orchestrator or multiple droplets with routing.
- **No WS connection reuse**: Each RPC call opens and closes a fresh tunnel+WS. For streaming this is fine, but rapid non-streaming calls would benefit from connection pooling.
- **socat is single-threaded per connection**: The `fork` flag spawns a process per connection. Under high concurrency, this could be a bottleneck. Alternatives: `haproxy` or a custom Go relay.
- **End-to-end chat not yet tested from UI**: The protocol, handshake, and plumbing are verified working via inline scripts. The full UI → API → tunnel → container → AI model → response path needs a live test.

---

## GTM Engine V1 — Implementation Session (2026-02-25)

### Session Scope

Implemented the core V1 feature set: agent identity system, chess engine scoring, chat UX improvements, platform admin dashboard, and settings expansion. The plan had 10 phases; 9 were implemented (Phase 4 — Campaign Build Wizard — was deferred pending field confirmation).

### Pre-Implementation Audit Findings

Before building, the codebase was audited. Key findings:

1. **Phase 9 (Skills Pre-Install) was already implemented.** `applyDefaultSkillPackToCompany()` in `src/lib/skills/skill-catalog.ts` is called at two points during onboarding: in `deploy-agent/route.ts` (line ~210) after main agent creation, and in `agents/provision/route.ts` (line ~95) after component agents are provisioned. Default skills are loaded from `openclaw/skills/gtm-engine/SKILL.md`. No work needed.

2. **Container tag inconsistency across 9 files.** Company container tags used the centralized `companyContainerTag()` function, but project container tags were constructed ad-hoc with `gtm_${slug}_project_${suffix}` template literals in 9 separate files — each with slightly different sanitization (or none). The `documents/route.ts` even had a `buildContainerTagVariants()` function that returned *both* raw and sanitized variants to hedge against mismatches.

3. **System prompts were generic.** `buildAgentSystemPrompt()` was synchronous and only injected a one-line identity (`"You are an AI GTM agent for this company"`) with no personality, no company context, no Supermemory profile.

---

### Phase 1A: SOUL.md — Agent Identity Document

**File created:** `src/lib/agents/SOUL.md`

**Design decisions:**
- SOUL.md is a static Markdown file read from disk at runtime and cached in memory (not stored in DB). This means identity updates deploy with code, not per-company. Per-company personality will come from Supermemory profile injection (Phase 1B).
- Julian's identity is "AI Head of GTM Operations" — not "assistant" or "chatbot." This framing makes the agent proactive rather than reactive.
- Five operational principles: Search Before You Speak, Cite Your Sources, Flag Uncertainty (with explicit confidence levels), Structured Output, Memory Discipline.
- Tool usage classified into "Always Use First" (search), "Use for Actions" (create, campaign ops), "Use Sparingly" (web search, doc creation).
- Three response patterns defined: Analyze (gather → present → compare → recommend → offer to execute), Draft (check context → draft → explain → offer variants), Research (internal first → external second → synthesize → store if lasting).

**Why this approach over per-company SOUL.md:** The per-company SOUL.md already exists in the OpenClaw agent workspace (generated by `agent-provisioning.ts`). That one is company-specific and lives on the container. This SOUL.md is the *platform-level* identity that injects into the system prompt of the Next.js chat route. They complement each other — platform identity + company context.

---

### Phase 1B: System Prompt Injection

**File modified:** `src/lib/chat/system-prompts.ts` (complete rewrite)

**What changed:**
- `buildAgentSystemPrompt()` is now `async` — it fetches the company profile from Supermemory.
- New `PromptParams.company` field accepts `{ id, name, slug, industry?, onboarding_data? }`.
- SOUL.md loaded from disk via `fs.readFileSync` on first call, cached in module-level `soulMdCache` variable (never re-read).
- Company profile fetched from Supermemory with `searchInsights(apiKey, containerTag, { query: "company profile overview", category: "company_profile", limit: 1 })`.
- Profile cache: per-slug, 5-minute TTL, `Map<string, { text, ts }>`.

**Three-tier fallback:**
1. Supermemory `company_profile` document (richest — built by intake pipeline)
2. `onboarding_data` from company DB record (moderate — ICP titles, verticals, product description)
3. Company name + slug only (minimal)

**Prompt structure order:**
```
1. SOUL.md (identity — who Julian is)
2. Base context (company name, memory container)
3. Company profile (from Supermemory or DB fallback)
4. Role instructions (main/campaigns/inbox)
5. Component context (if in specific UI view)
6. Available tools
7. Working memory (NOTES.md)
```

**Callers updated:**
- `src/app/api/chat/route.ts` line 148: `buildSystemPrompt()` wrapper is now `async`, passes `company: { id, name, slug }` from the already-fetched company row.
- `src/lib/chat/task-worker.ts` line 208: Same — `await buildAgentSystemPrompt()` with company data from the task's company lookup.

**Design decision — why async instead of pre-loading:** The Supermemory fetch is I/O-bound (~100-200ms) and happens once per 5 minutes per company (cached). Making the function async keeps the architecture honest about the I/O cost. The alternative (background polling) would add complexity for negligible gain since chat messages already have ~500ms+ latency from the SSH tunnel.

---

### Phase 1C: Container Tag Consistency

**File modified:** `src/lib/supermemory-client.ts`
**9 files fixed across the codebase**

**What changed:**
- Added `sanitizeTagToken(input)`: lowercases, strips non-alphanumeric except underscore, collapses runs, trims edges.
- Added `projectContainerTag(companySlug, projectSuffix)`: builds `gtm_{sanitized_slug}_project_{sanitized_suffix}`.
- Changed existing `companyContainerTag()` to use `sanitizeTagToken()` internally (behavior change: now lowercases, previously preserved case and allowed hyphens).

**Files updated to use centralized function:**

| File | Before | After |
|------|--------|-------|
| `src/lib/intake/supermemory-sync.ts` | `` `gtm_${slug}_project_${suffix}` `` | `projectContainerTag(slug, suffix)` |
| `src/lib/chat/tools.ts` | `` `gtm_${slug}_project_${suffix}` `` | `projectContainerTag(slug, suffix)` |
| `src/lib/recall/trace-recall.ts` | `` `gtm_${slug}_project_${suffix}` `` | `projectContainerTag(slug, suffix)` |
| `src/app/api/skills/execute/route.ts` | `` `gtm_${slug}_project_${suffix}` `` | `projectContainerTag(slug, suffix)` |
| `src/app/api/chat/route.ts` (×2) | `` `gtm_${slug}_project_default` `` | `buildProjectContainerTag(slug, "default")` |
| `src/app/api/knowledge/projects/route.ts` | `` `gtm_${slug}_project_${suffix}` `` | `buildProjectContainerTag(slug, suffix)` |
| `src/app/api/knowledge/projects/[id]/route.ts` | `` `gtm_${slug}_project_${suffix}` `` | `buildProjectContainerTag(slug, suffix)` |
| `src/app/api/knowledge/projects/[id]/documents/route.ts` | Local `sanitizeTagToken` + `buildContainerTagVariants` returning 2 variants | Single `projectContainerTag()` call, removed local sanitizer |
| `src/app/api/knowledge/projects/[id]/upload/route.ts` | `` `gtm_${slug}_project_${suffix}` `` | `projectContainerTag(slug, suffix)` |

**Design decision — lowercase normalization:** The old `companyContainerTag()` preserved case and allowed hyphens (`[^a-zA-Z0-9_-]`). The new `sanitizeTagToken()` lowercases everything and strips hyphens. This is a breaking change for companies with mixed-case slugs that already have Supermemory data under the old tag format. However, all existing company slugs in the DB are already lowercase (verified from `companies.slug` column), so this is safe in practice. The `buildContainerTagVariants()` workaround in documents/route.ts (which returned both variants) existed specifically because of this inconsistency — it's no longer needed.

---

### Phase 7: Chess Engine Campaign Scoring

**Files created:**
- `src/lib/chess-engine/types.ts`
- `src/lib/chess-engine/evaluator.ts`
- `src/app/api/campaigns/[id]/score/route.ts`

**Scoring formula:**
```
CAMPAIGN_SCORE = (MATERIAL × POSITION_MULTIPLIER × MOBILITY) + TEMPO_BONUS
WIN_PROBABILITY = sigmoid(CAMPAIGN_SCORE / 2000) × 100
EXPECTED_REVENUE = WIN_PROBABILITY × TARGET_ACV / 100
```

**Material values (centipawn):**

| Component | Value | Rationale |
|-----------|-------|-----------|
| Verified engaged lead | 9 | Highest value — prior engagement signals interest |
| Verified cold lead | 5 | Email deliverable but no engagement history |
| Unverified lead | 3 | Catch-all or unvalidated — risky |
| Rich sequence (3+ steps, personalized) | 7 | Proven to outperform basic templates 2-3x |
| Basic sequence | 3 | Functional but limited |
| Warm domain (health ≥70) | 5 | Good deliverability |
| Cold domain | 2 | Deliverability risk |
| Booking link active | 4 | Reduces friction to conversion |
| CRM connected | 3 | Enables pipeline tracking |

**Position factors (each 0.0-1.0):**
- `icpAlignment`: Direct from ICP match rate
- `timing`: Inferred from open rate (× 1.5 multiplier, clamped)
- `competitivePosition`: Positive reply rate / total reply rate
- `engagementDepth`: Weighted combo of opens (0.2), clicks (0.3), replies (0.3), positives (0.2)
- `listHealth`: `1 - (bounceRate × 5)` — aggressive penalty for bounces

Position multiplier uses **geometric mean** of all 5 factors. This rewards balanced campaigns over ones that are strong in one area but weak in others.

**Mobility (available action space):**
- Alternative sequences (÷5, weight 0.3)
- Untapped ICP segments (÷10, weight 0.4)
- Active channels (÷3, weight 0.3)
- Floor of 0.1 to prevent zeroing the score

**Tempo bonus (speed advantage):**
- New campaigns: 50 (neutral)
- First 14 days: engagement velocity × 5 (early wins rewarded)
- After 14 days: decays unless engagement stays strong

**Grading: A+ (≥1500) through F (<50). Colors: green (≥600), amber (≥200), red (<200).**

**API route design:** `GET /api/campaigns/[id]/score?companyId=xxx`
- Fetches campaign data + stats from PlusVibe API
- Fetches domain health from `inboxing_domains` table
- Checks infrastructure: booking link (Calendly key), CRM (Close key)
- Queries `inbox_messages` for engagement data
- Builds `CampaignEvalInput` and runs `evaluateCampaign()`
- Returns full `EvaluationResult` including breakdown, grade, color, and recommendations

**Design decision — why fetch from PlusVibe at request time:** Campaign data changes frequently (new leads, replies, bounces). Caching would require invalidation logic. Since this endpoint is called on campaign detail views (not list views), the per-request latency is acceptable. For the campaign list score badges (Phase 7D UI), a batch endpoint or background scoring job would be better — deferred to V1.1.

---

### Phase 3: Chat Welcome Personalization

**File modified:** `src/components/chat/chat-welcome.tsx`

**What changed:**
- Imported `useCompany`, `useDashboardMetrics`, `useCampaigns` hooks
- Dynamic suggestion generation in `useMemo` based on company data:
  - Active campaign → `"Analyze '{name}' performance"`
  - Paused campaign → `"Should I reactivate '{name}'?"`
  - Has replies → `"Review my {N} inbox replies"`
  - Positive replies but no meetings → `"Help me convert positive replies into meetings"`
  - Has campaigns with sends → `"Show me my campaign funnel breakdown"`
- General-purpose suggestions fill remaining slots (max 5 total)
- Subtitle now includes company name: `"I'm Julian, your GTM AI agent for {companyName}."`
- Falls back to static `FALLBACK_SUGGESTIONS` if no company data available

**Design decision — client-side data fetching:** The welcome component uses the same SWR hooks that the dashboard uses. These hooks return cached data instantly if the user navigated from dashboard → chat. No new API calls needed in the common case.

---

### Phase 6: /tool Command Interface

**File modified:** `src/components/chat/chat-input.tsx`

**What was added:**
- 8 slash commands: `/search`, `/create`, `/get`, `/tags`, `/research`, `/analyze`, `/draft`, `/folders`
- Each command has: tool name, label, description, icon, and parameter definitions
- Autocomplete dropdown appears when input starts with `/` and has no spaces (typing phase)
- Keyboard navigation: Arrow Up/Down to select, Tab/Enter to confirm, Escape to dismiss
- Commands with no params (e.g., `/tags`) → immediately sends as natural language request
- Commands with params (e.g., `/search`) → inserts command with trailing space, user types params
- On submit: slash command + params converted to natural language: `"Use the search_documents tool with query: {args}"`

**Design decision — natural language conversion vs. structured tool calls:** The slash commands convert to natural language prompts rather than calling tools directly. This keeps the chat flow unified — the agent receives a clear instruction and can use its judgment about parameters, context, and whether to chain multiple tools. Direct tool execution would bypass the agent's reasoning, which defeats the purpose of having an intelligent agent.

**Design decision — command list is static, not fetched:** The 8 commands are hardcoded rather than pulled from the agent's tool definitions. This avoids an API call on every keystroke and keeps the UX snappy. If new tools are added, the command list needs a manual update. A future improvement could fetch available tools on page load and cache them.

---

### Phase 8: Platform Admin Dashboard

**Files created:**
- `src/app/admin/page.tsx`
- `src/app/api/admin/metrics/route.ts`
- `src/app/api/admin/companies/route.ts`
- `src/app/api/admin/usage/route.ts`

**File modified:** `src/components/app-shell.tsx` (added Admin nav item with Shield icon)

**Access control:** All three API routes check `account_members` for `role === "owner"`. This means any user who owns *any* account can access admin. For a single-tenant platform this is correct. For multi-org, a platform-level admin flag would be needed.

**Metrics endpoint (`/api/admin/metrics`):**
- 9 parallel Supabase queries: company counts, user count, container statuses, domain counts (total + healthy), session count, message count, recent tasks
- Container status breakdown (running/provisioning/stopped/etc.)
- Task status breakdown from last 20 tasks

**Companies endpoint (`/api/admin/companies`):**
- All companies with status, container info, agent counts, domain health averages
- Enrichment via parallel queries to `company_agents` and `inboxing_domains`

**Usage endpoint (`/api/admin/usage?days=7`):**
- Aggregates by company over configurable period (7/14/30/max 90 days)
- Per-company: messages (user vs assistant), sessions, tasks (total + failed)
- Totals row for platform-wide numbers

**Admin page layout:**
- Overview: 4 metric cards (companies, users, sessions, domains)
- Container Health: full company table with status badges, agent counts, domain health
- Usage: period selector (7d/14d/30d), 4 metric cards, per-company breakdown table
- Recent Tasks: last 20 agent tasks with status icons

---

### Phase 10: Settings Page Expansion

**File modified:** `src/components/Settings.tsx`

**New tabs added:**

| Tab | Purpose | Implementation |
|-----|---------|---------------|
| **Integrations** | Per-company API key management | Form fields for PlusVibe (key + workspace), Close, Calendly, Supermemory. Saves to `integration_credentials` JSONB via PATCH to onboarding endpoint. Password-masked inputs. |
| **Agent** | Agent behavior defaults | Default agent type selector (main/campaigns/inbox/crm), action budget per session (1-50), auto-approve toggle. |
| **Team** | Member management | Lists members from API, email invite form. Member display with avatar initial, email, role badge. |

**Enhanced existing tabs:**
- **Notifications**: Added webhook URL input for Slack/email, expanded to 6 notification types (added Task Failed, New Meeting Booked)
- **Security**: Added MFA toggle and Audit Log toggle (UI only — backend enforcement deferred)
- **API Status**: Updated description to reference Integrations tab for credential management

**Design decision — saving via onboarding PATCH:** The Integrations and Agent tabs save via `PATCH /api/companies/{id}/onboarding` rather than a dedicated settings endpoint. This reuses the existing endpoint that already handles `integration_credentials` JSONB updates. A proper `/api/companies/{id}/settings` route would be cleaner but adds another endpoint for no functional gain in V1.

---

### Decision Log (V1 Session)

| Decision | Options Considered | Chosen | Rationale |
|----------|--------------------|--------|-----------|
| SOUL.md location | DB per-company, OpenClaw workspace, platform file on disk | Platform file on disk + Supermemory profile | Platform identity is shared; company personality comes from Supermemory. Avoids DB round-trip on every chat. |
| System prompt async vs sync | Sync with pre-cached profile, Async with per-call fetch | Async with 5-min cache | Honest about I/O cost. 5-min TTL means typically 0 fetches per chat session. |
| Container tag sanitization | Preserve hyphens, Strip everything non-alphanum | Strip to `[a-z0-9_]` only | Simplest common denominator. All existing slugs are lowercase alphanumeric already. |
| Chess engine position multiplier | Arithmetic mean, Geometric mean, Minimum | Geometric mean | Rewards balance. A campaign with 5 strong factors scores higher than one with 4 perfect + 1 zero. |
| Slash commands → tool calls | Direct structured tool calls, Natural language conversion | Natural language | Keeps agent in the loop. Agent can reason about context and chain tools. |
| Admin access control | Platform admin flag, Account owner check, Superuser email list | Account owner check | Simplest for single-operator platform. Multi-org would need dedicated admin table. |
| Settings persistence | Dedicated settings endpoint, Reuse onboarding PATCH | Reuse onboarding PATCH | Fewer endpoints to maintain. `integration_credentials` JSONB is already the target table. |

---

### What's Left to Build

#### Phase 2: E2E Testing (Manual — cannot be automated without running infrastructure)

Testing checklist that must be run manually with live Supabase + OpenClaw:

- [ ] Chat → OpenClaw → SSE: Send message, verify content/reasoning/tool events stream correctly
- [ ] Session persistence: Reload page, verify session restores with history
- [ ] Tool execution: Trigger knowledge search from chat, verify tool card renders
- [ ] `create_document`: Agent creates vault doc, verify it appears in knowledge base
- [ ] Onboarding → Intake → Vault: Complete onboarding for new company, confirm intake pipeline runs
- [ ] Company profile in chat: After onboarding, verify Julian references company context
- [ ] File upload: Upload PDF via knowledge file upload, confirm extraction
- [ ] PlusVibe webhook: `curl` sample payload to `/api/webhooks/plusvibe`, verify processing
- [ ] Chess engine score: Navigate to campaign, verify score badge + breakdown
- [ ] Slash commands: Type `/search` in chat, verify autocomplete + execution

#### Phase 4: Campaign Build Wizard (Blocked — needs field confirmation)

**Needs your input on:**
1. Confirm the 5 wizard steps: Basics → Targeting → Messaging → Schedule → Review
2. Fields per step (especially: what targeting filters matter most?)
3. AI Draft mode behavior (how autonomous should Julian be?)
4. Whether Step 5 should include the chess engine score preview

**Files that will be created:**
- `src/app/campaigns/build/page.tsx` — 5-step wizard page
- `src/components/campaigns/build-wizard.tsx` — Wizard state management + step rendering
- `src/components/campaigns/targeting-panel.tsx` — ICP selection + audience filters

**Files that will be modified:**
- `src/components/campaigns/sequence-editor.tsx` — Extend for wizard integration (preview pane, AI suggestions)

#### Phase 5: Inbox Polish (Blocked — needs card layout confirmation)

**Needs your input on:**
- Card layout: confirm proposed additions (thread count, time since reply, hover quick actions, priority indicator)
- Whether to use `react-window` for virtual scrolling or simpler pagination

**Files that will be modified:**
- `src/app/inbox/page.tsx` — Add virtual scrolling, lazy-load message bodies

#### Remaining UI Polish (not in original plan but surfaced during build)

- [ ] Campaign list page: Add chess engine score badge on each campaign card (needs batch scoring endpoint)
- [ ] Campaign detail: Score breakdown modal/panel
- [ ] Admin page: Role-gate the nav item (currently always visible)
- [ ] Settings: Wire team member list to actual `account_members` data (currently returns empty for most queries)
- [ ] Settings: Add proper save feedback for Agent and Notifications tabs
- [ ] Slash commands: Add inline parameter form for complex tools (currently just text input after command)

#### Known Technical Debt

- All Supabase queries use untyped client (`createClient` without generated types) — causes `never` type errors across ~70 locations. Generating types from the DB schema would fix this.
- The Settings tabs save via the onboarding PATCH endpoint which is semantically wrong. Should have a dedicated settings endpoint.
- Admin access check queries `account_members` for any `role === "owner"` — should check for a specific platform admin flag.
