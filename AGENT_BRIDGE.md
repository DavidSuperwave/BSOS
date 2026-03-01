# Agent Bridge Architecture

## Overview

Blitzscale OS now supports two agent modes:

1. **Dev Mode (You)** - Full access via desktop OpenClaw
2. **Company Mode (Clients)** - Limited, isolated web agents

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEB UI (Vercel)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Dev Chat    │  │ Company     │  │ Message Queue (Redis)   │  │
│  │ (isDev=true)│  │ Chat        │  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘  │
│         │                │                                       │
│         └────────────────┼───────────────────────────────────────┘
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                 │
          ▼                                 ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Agent Bridge       │         │  Web Agent          │
│  (Desktop)          │         │  (Cloud/Serverless) │
│                     │         │                     │
│  • Polls Redis      │         │  • Company-scoped   │
│  • Full tool access │         │  • Limited tools    │
│  • File system      │         │  • API-only         │
│  • Execute commands │         │                     │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Desktop OpenClaw   │         │  Supermemory        │
│  (Full Access)      │         │  (Company namespaces│
│                     │         │   company:{id})     │
│  • read/write       │         │                     │
│  • exec             │         │  • Perplexity       │
│  • all APIs         │         │  • PlusVibe         │
└─────────────────────┘         └─────────────────────┘
```

## File Structure

```
automation/gtm-engine/
├── agent-bridge.js              # Desktop polling service
├── ui/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── supermemory-namespace.ts  # Multi-tenant schema
│   │   │   └── web-agent.ts              # Company-scoped agent
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   └── chat/
│   │   │   │       └── route.ts          # Chat API router
│   │   │   ├── agent/
│   │   │   │   └── page.tsx              # Dev agent page
│   │   │   └── page.tsx                  # Root chat (dev mode)
│   │   └── components/
│   │       └── agent-chat.tsx            # Chat UI component
│   └── .env.example                      # Environment template
```

## Setup

### 1. Configure Environment

```bash
cd automation/gtm-engine/ui
cp .env.example .env.local
```

Fill in:
- `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` (from Upstash)
- `SUPERMEMORY_API_KEY`
- `PERPLEXITY_API_KEY`

### 2. Start the UI

```bash
npm run dev
```

### 3. Start Agent Bridge (Desktop)

In a separate terminal:

```bash
cd automation/gtm-engine
node agent-bridge.js
```

This connects your desktop OpenClaw to the web UI.

## Usage

### Dev Mode (You)

Navigate to `/agent` or use the root `/` chat.

Capabilities:
- ✅ Check build status
- ✅ Edit code
- ✅ Run commands
- ✅ Access all APIs
- ✅ Full Supermemory access

### Company Mode (Clients)

For testing, navigate to `/agent` and switch to Company tab.

Capabilities:
- ✅ Query company-scoped Supermemory
- ✅ Research with Perplexity
- ✅ View PlusVibe campaigns
- ✅ Analyze replies
- ❌ No file system access
- ❌ No command execution

## Testing Routing

### Test 1: Dev Mode

1. Open `http://localhost:3000/agent`
2. Type: "Check the build status"
3. Message goes to Redis `gtm:queue:dev`
4. Agent Bridge picks it up
5. Response streamed back

Expected: Message processed by desktop agent with full tool access.

### Test 2: Company Mode

1. Open `http://localhost:3000/agent`
2. Switch to Company Agent tab
3. Type: "List my campaigns"
4. Web Agent processes directly (no Redis)
5. Limited tool scope enforced

Expected: Campaigns listed, but filesystem commands rejected.

### Test 3: Verify Isolation

```bash
# In company chat:
"Read the file /etc/passwd"

# Expected response:
"I don't have access to the file system. I can help you with..."
```

## Company Namespace Schema

```
company:{companyId}:campaigns    → Campaign metadata
company:{companyId}:replies      → Email replies
company:{companyId}:research     → Perplexity research
company:{companyId}:icp          → ICP definitions
company:{companyId}:knowledge    → General knowledge
company:{companyId}:interactions → Chat history
admin:system                     → Cross-company data (admin only)
```

## Deployment

### Vercel (Web UI)

```bash
cd automation/gtm-engine/ui
vercel --prod
```

Required env vars in Vercel:
- `UPSTASH_REDIS_URL`
- `UPSTASH_REDIS_TOKEN`
- `SUPERMEMORY_API_KEY`
- `PERPLEXITY_API_KEY`

### Desktop Agent

Run locally:

```bash
node agent-bridge.js
```

For 24/7 operation:
- Use PM2: `pm2 start agent-bridge.js`
- Or run on a VPS/Raspberry Pi

## Troubleshooting

### "Redis not configured"

Set `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` in `.env.local`

### "OpenClaw not reachable"

Ensure OpenClaw is running on your desktop:
```bash
openclaw status
```

### Messages stuck in "pending"

1. Check Agent Bridge is running
2. Check Redis connection in bridge logs
3. Verify message in Redis: `LRANGE gtm:queue:dev 0 -1`

### Company agent can't access data

Verify company namespace exists in Supermemory:
```javascript
// Query: namespace:company:test-company
```

## Security Considerations

1. **Dev Mode** requires physical access to your machine (runs locally)
2. **Company Mode** is isolated per-company via Supermemory namespaces
3. **Redis** connection should use TLS in production
4. **API Keys** never exposed to client-side code
5. **Tool Access** enforced server-side, never client-side

## Next Steps

1. Test the routing with both modes
2. Add company onboarding flow
3. Build admin dashboard for managing companies
4. Add workflow scheduling (cron jobs per company)
