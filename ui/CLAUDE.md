# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Blitzscale OS UI — a Next.js 14 dashboard for the GTM Engine. Provides campaign management, inbox/email management, ICP feedback analysis, knowledge base, analytics, skills store, and an AI agent chat interface ("Julian") for autonomous GTM operations.

## Development Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint
```

Windows quick start: `START-UI.bat`

There is no test framework configured. No Jest, Vitest, or other test runner is set up.

### ESLint Rules

Configured in `.eslintrc.json` (extends `next/core-web-vitals`):
- `no-console`: warn (only `console.warn`, `console.error`, `console.debug` allowed)
- `prefer-const`: error
- `no-var`: error
- `eqeqeq`: error (always use `===`/`!==`)

## Architecture

### Stack

- **Framework**: Next.js 14.1.0, App Router, TypeScript (strict), Tailwind CSS 4.1.18
- **Auth**: Supabase Auth with SSR cookie handling (`@supabase/ssr`)
- **Database**: PostgreSQL via Supabase (service role key, no Prisma)
- **Data fetching**: SWR hooks in `src/lib/hooks.ts` (client-side), fetch in API routes (server-side)
- **Agent backend**: OpenClaw via WebSocket with Ed25519 device auth (`src/lib/openclaw-client.ts`)
- **Charts**: Recharts
- **UI primitives**: Radix UI, shadcn/ui (New York style), Lucide icons
- **Rich text**: TipTap editor
- **Drag-and-drop**: @dnd-kit (used in CRM task board, sequence editor)
- **CSS**: Tailwind 4 syntax — uses `@import "tailwindcss"` and `@theme inline {...}` in `globals.css`, with `@tailwindcss/postcss` as the PostCSS plugin

### Path Alias

`@/*` maps to `./src/*`

### Layout & Provider Hierarchy

Root layout (`src/app/layout.tsx`) wraps all pages with providers in this order:
```
<AuthProvider> → <CompanyProvider> → <AuthGate> → <EventProvider> → {children}
```

`AuthGate` (`src/components/auth-gate.tsx`) sits between `CompanyProvider` and `EventProvider`, handling loading states and auth redirects before rendering child content.

Pages are client components that wrap content with `AppShell` (`src/components/app-shell.tsx`):

```tsx
"use client"
import { AppShell } from "@/components/app-shell"

export default function Page() {
  return (
    <AppShell header={{ title: "Title", subtitle: "Subtitle", actions: <Button /> }}>
      {/* content */}
    </AppShell>
  )
}
```

`AppShell` provides the sidebar (company selector, navigation, user info) and header bar. Navigation items are defined in the `navItems` array in `app-shell.tsx`.

### Multi-Tenancy

Almost everything is scoped by company. The `CompanyProvider` (`src/contexts/company-context.tsx`) manages company selection:
- Fetches user's companies from `/api/companies`
- Persists selection to `localStorage` (key: `blitzscale:selected_company_id`)
- Access via `useCompany()` hook → `{ companies, selectedCompany, setSelectedCompany, refresh }`

Most SWR hooks and API calls take `companyId` as a parameter. When adding new features, always scope data by company.

### Database Access — Supabase Only

All database access uses the Supabase client with service role key.

API routes typically create a lazy-init Supabase admin client:
```ts
const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

The database schema is defined across migrations in `supabase/migrations/`. The base schema is in `20250218_blitzscale_v2.sql`. Additional migrations add skills store tables, media storage, knowledge tools, projects, and more.

### API Route Authentication (`src/lib/api-auth.ts`)

Three helpers for securing API routes:
- `authenticateUser()` → returns `{ userId, email }` or `null`
- `verifyCompanyAccess(userId, companyId)` → checks `account_members` → `companies` ownership chain (with legacy `user_id` fallback)
- `requireCompanyAccess(companyId)` → combined: returns `{ auth, access }` or `{ error: NextResponse }`

### Routing

Uses Next.js App Router. The root page (`/`) is the AI chat agent interface, not a redirect.

Key routes: `/` (chat agent), `/dashboard`, `/campaigns`, `/inbox`, `/inboxes`, `/icp`, `/knowledge`, `/analytics`, `/crm`, `/skills`, `/insights`, `/onboarding`, `/(auth)/login`, `/(auth)/signup`.

API routes are all under `src/app/api/` — organized by domain: `chat/`, `companies/`, `dashboard/`, `inbox/`, `inboxing/`, `knowledge/`, `plusvibe/`, `tools/`, `webhooks/`, etc.

### Chat System

The chat endpoint (`/api/chat`) supports SSE streaming via OpenClaw:
- **Request**: `{ message, companyId, sessionId?, sessionType?, componentContext?, stream? }`
- **Session types**: `main`, `campaigns`, `crm`, `inbox`
- **Rate limited**: 30 requests per 60 seconds (in-memory token-bucket in `src/lib/rate-limit.ts` — single-instance only, no Redis)
- **Session compaction**: `src/lib/chat/compaction.ts` manages token-efficient session history
- **System prompts**: `src/lib/chat/system-prompts.ts` builds context-aware agent prompts
- **Tool definitions**: `src/lib/chat/tools.ts` defines chat-available tools
- **Value assessment**: `src/lib/chat/value-assessment.ts` scores insight quality

Client-side streaming via `useStreamingChat()` hook in `src/lib/hooks/use-streaming-chat.ts` — handles optimistic UI updates, SSE parsing, and tool call visualization.

### OpenClaw Client (`src/lib/openclaw-client.ts`)

Communicates with OpenClaw agents via both HTTP hooks and WebSocket:
- Ed25519 device authentication for protocol v3
- `chatSend()` for non-streaming, `chatSendStream()` for SSE streaming
- Gateway token auth with cryptographic challenge signing

### Agent Tools (`src/lib/agent-tools.ts`)

Tools for the Julian agent: PlusVibe campaign operations, knowledge base CRUD, Supermemory semantic search, Perplexity research. Each tool has `name`, `description`, `parameters`, and `execute()`. Exported via `executeTool()` and `getToolDescriptions()`. Tools are company-scoped and fall back to env vars for default credentials.

### Skills Store (`src/lib/skills/`)

A learnable skills system for the agent — browse/install/learn/share/sync/validate skills. Types in `src/lib/skills/types.ts`, routing in `src/lib/skills/router.ts`. API routes under `/api/companies/[id]/agent/skills/`.

### Intake Pipeline (`src/lib/intake/`)

Data ingestion and company profile synthesis: orchestrates ingestion from onboarding data and CRM records, builds company profiles, analyzes uploaded documents, syncs to Supermemory.

### Knowledge System (`src/lib/knowledge/`)

Extended knowledge management: tool definitions for agent knowledge operations, knowledge-specific system prompts, project-level organization via `/api/knowledge/projects/*`.

### Supermemory Integration (`src/lib/supermemory-client.ts`)

Semantic search and memory layer using container tags for company isolation (e.g., `gtm_company_slug`). Used by the skills system, intake pipeline, and knowledge system for semantic retrieval.

### Company Credential Resolution (`src/lib/company-credentials.ts`)

Pattern for resolving per-company integration credentials: checks `integration_credentials` JSONB on the companies table before falling back to global env vars. Used by PlusVibe, Close CRM, and other integrations.

### Data Hooks (`src/lib/hooks.ts`)

SWR-based typed hooks (~900 lines). Generic: `useApiData<T>(url, config?)` with `revalidateOnFocus: false` default. All hooks follow the pattern of fetching from local API routes with optional `companyId` and filter parameters. Mutation helper: `jsonRequest<T>(url, init)` for consistent error handling.

### Auth & Middleware

Supabase SSR auth with middleware (`src/middleware.ts`) that calls `updateSession()` from `src/lib/supabase/middleware.ts`. Middleware matcher excludes `_next/static`, `_next/image`, static assets, and API routes.

Redirect rules:
- Unauthenticated users → `/login`
- Authenticated users on auth pages → `/`
- Logged-in users without companies → `/onboarding`

Security headers applied by middleware: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: on`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

Server-side client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`.

### Styling

Dark theme with blue accent palette. HSL CSS variables in `globals.css` using Tailwind 4 `@theme inline` syntax. Background: `#050817`, primary accent: `#62b7ff`. Custom utility classes: `glass-card` (frosted glass), `status-active/paused/draft`, `text-gradient`, `pulse-live`, `animate-shimmer`, `animate-fade-in`. Fonts: Inter (sans), JetBrains Mono (mono).

### Environment Configuration

Centralized in `src/lib/env.ts` — `env(key)` returns `null` for missing keys (never crashes). All config accessed via `envConfig` object with lazy getters. Features gracefully degrade when optional credentials are missing.

**Required env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENCLAW_GATEWAY_TOKEN`, `SUPERMEMORY_API_KEY`. All others are optional — see `.env.example`.

### Build & Deployment

- `next.config.js` sets `output: "standalone"` for Docker containerization
- `experimental.serverComponentsExternalPackages` includes `ssh2` and `ws` to prevent bundling issues
- Dockerfile: multi-stage build (deps → builder → runner), Node 20 Alpine, runs as non-root user
- Health check endpoint: `/api/health` (used by Docker health check)
- `docker-compose.yml` runs two services: `nextjs` (port 3000) and `openclaw`, on a shared `blitzscale` bridge network with `openclaw-data` volume
- CI: GitHub Actions workflow (`.github/workflows/docker-build.yml`) builds and pushes both images to GHCR on push to `main` or version tags
- Optional Sentry integration (only activated when `NEXT_PUBLIC_SENTRY_DSN` is set)

## Adding a New Page

1. Create `src/app/newpage/page.tsx` as a `"use client"` component
2. Wrap content with `<AppShell header={...}>`
3. Add nav item in `src/components/app-shell.tsx` `navItems` array
4. If it needs data, add a typed SWR hook in `src/lib/hooks.ts`
5. If it needs a backend, add an API route in `src/app/api/`
6. Scope data by `companyId` from `useCompany()` context

## Adding shadcn/ui Components

Config in `components.json`: New York style, Lucide icons, CSS variables enabled. Aliases: `@/components/ui` for UI primitives, `@/lib/utils` for the `cn()` helper.

## Key Reference Documents

- `BLITZSCALE_BUILD_MASTER.md` — Database table inventory and build status
- `MASTER_ARCHITECTURE_DOCUMENT.md` — 4-layer storage architecture and system overview
- `SKILLS_STORE_IMPLEMENTATION.md` — Detailed skills subsystem documentation
- `.env.example` — All required environment variables
