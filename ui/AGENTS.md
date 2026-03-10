# Blitzscale OS UI - Agent Documentation

## Project Overview

**Blitzscale OS UI** is a modern React dashboard for the GTM (Go-To-Market) Engine. It provides an interface for monitoring outbound email campaigns, analyzing ICP (Ideal Customer Profile) feedback, managing multi-company operations, and interacting with an AI Agent named "Julian" for autonomous GTM operations.

The application connects to a backend API (GTM Engine) and integrates with multiple third-party services including PlusVibe (email campaigns), Close CRM (lead management), Supermemory (knowledge storage), and Perplexity AI (market research).

---

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js | 14.1.0 |
| Language | TypeScript | 5.3.0 |
| UI Library | React | 18.2.0 |
| Styling | Tailwind CSS | 3.4.0 |
| Forms | @tailwindcss/forms | 0.5.7 |
| Charts | Recharts | 2.10.0 |
| Icons | Lucide React | 0.312.0 |
| Dates | date-fns | 3.3.0 |
| Data Fetching | SWR | 2.2.4 |
| Utilities | clsx | 2.1.0 |
| Linting | ESLint | 8.56.0 |

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with Inter font and metadata
│   ├── page.tsx            # Main page with view routing logic
│   └── globals.css         # Tailwind directives + custom CSS components
├── components/
│   ├── Sidebar.tsx         # Navigation sidebar with company selector
│   ├── Dashboard.tsx       # Main dashboard with metrics and charts
│   ├── Campaigns.tsx       # Campaign list, filters, and creation modal
│   ├── ICPFeedback.tsx     # AI insights, radar charts, persona analysis
│   ├── Analytics.tsx       # Advanced analytics placeholder
│   ├── Settings.tsx        # Settings panel with tabs
│   └── AgentInterface.tsx  # AI chat interface with tool visualization
└── lib/
    ├── api.ts              # REST API client for backend communication
    ├── agent-tools.ts      # Tool integrations for AI Agent (4 services)
    └── workflow-engine.ts  # Workflow orchestration engine
```

---

## Build and Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run ESLint
npm run lint
```

### Windows Quick Start

For Windows users, a batch file is provided:
```batch
START-UI.bat
```

This script checks for Node.js, installs dependencies if needed, and starts the dev server.

---

## Configuration Files

### next.config.js
```javascript
// Configures API proxy to backend at localhost:3001
{
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*'
      }
    ];
  }
}
```

### tailwind.config.js
- Custom color palette: Obsidian Green brand colors, accent colors (emerald, amber, rose, blue, violet)
- Custom font family: Inter, JetBrains Mono
- Content paths: src/pages, src/components, src/app

### tsconfig.json
- Strict TypeScript mode enabled
- Path alias: `@/*` maps to `./src/*`
- Module resolution: bundler
- JSX: preserve

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | http://localhost:3001 | Backend API base URL |
| `PLUSVIBE_API_KEY` | Yes (for agent) | - | PlusVibe API key |
| `CLOSE_API_KEY` | Yes (for agent) | - | Close CRM API key |
| `SUPERMEMORY_API_KEY` | Yes (for agent) | - | Supermemory API key |
| `PERPLEXITY_API_KEY` | Yes (for agent) | - | Perplexity AI API key |

**Note**: Environment variables must be prefixed with `NEXT_PUBLIC_` to be accessible in client components.

---

## Code Style Guidelines

### Component Structure
```typescript
'use client';  // Required for client-side interactivity

import { useState } from 'react';
import { IconName } from 'lucide-react';
import clsx from 'clsx';

// Types first
interface Props {
  // ...
}

// Component function
export default function ComponentName({ prop }: Props) {
  // Hooks at top
  const [state, setState] = useState();
  
  // Handler functions
  const handleAction = () => { };
  
  // Render
  return (
    <div className="glass-card">
      {/* Content */}
    </div>
  );
}
```

### CSS Class Conventions

Use these custom component classes defined in `globals.css`:

| Class | Purpose |
|-------|---------|
| `glass-card` | Primary card container with glassmorphism effect |
| `metric-card` | Dashboard metric cards with hover effect |
| `btn-primary` | Primary action buttons (emerald background) |
| `btn-secondary` | Secondary buttons (subtle background) |
| `input-field` | Form inputs with consistent styling |
| `nav-link` | Navigation items in sidebar |
| `nav-link.active` | Active navigation state |
| `status-badge` | Status indicators |
| `status-active` / `status-paused` / `status-draft` | Status variants |

### Color Usage

```css
/* Primary brand */
bg-obsidian-500  /* #344532 */
text-accent-emerald  /* #10b981 */

/* Status colors */
text-accent-rose     /* Errors, negative metrics */
text-accent-amber    /* Warnings, paused states */
text-accent-blue     /* Information, links */
text-accent-violet   /* Purple accents */
```

### Naming Conventions

- **Files**: PascalCase for components (e.g., `AgentInterface.tsx`)
- **Functions**: camelCase
- **Interfaces**: PascalCase with descriptive names
- **Constants**: UPPER_SNAKE_CASE for true constants

---

## API Integration

### Backend API Endpoints (src/lib/api.ts)

| Function | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| `fetchCampaigns()` | /api/campaigns | GET | List all campaigns |
| `createCampaign()` | /api/campaigns | POST | Create new campaign |
| `activateCampaign()` | /api/campaigns/:id/activate | POST | Activate campaign |
| `pauseCampaign()` | /api/campaigns/:id/pause | POST | Pause campaign |
| `fetchDashboardMetrics()` | /api/metrics | GET | Dashboard metrics |
| `fetchReplyTrends()` | /api/analytics/reply-trends | GET | Reply trend data |
| `fetchSentimentDistribution()` | /api/analytics/sentiment | GET | Sentiment data |
| `fetchICPInsights()` | /api/icp/insights | GET | ICP insights |
| `generateICPInsights()` | /api/icp/generate | POST | Generate AI insights |
| `fetchPersonaPerformance()` | /api/icp/personas | GET | Persona analytics |
| `fetchCompanies()` | /api/companies | GET | List companies |
| `fetchCompany()` | /api/companies/:slug | GET | Company details |
| `createCompany()` | /api/companies | POST | Create company |
| `runResearch()` | /api/research | POST | Run Perplexity research |
| `fetchResearchResults()` | /api/research/:slug | GET | Get research results |
| `updateSettings()` | /api/companies/:slug/settings | PUT | Update settings |

### Third-Party Tool Integrations (src/lib/agent-tools.ts)

The AI Agent has access to 4 toolsets:

1. **PlusVibe Tools** (`plusvibeTools`)
   - `listCampaigns()`, `getReplies()`, `createCampaign()`, `uploadLeads()`, `activateCampaign()`

2. **Close CRM Tools** (`closeTools`)
   - `getLeads()`, `createLead()`, `updateLead()`, `addNote()`

3. **Supermemory Tools** (`supermemoryTools`)
   - `search()`, `addDocument()`, `queryInsights()`

4. **Perplexity AI Tools** (`perplexityTools`)
   - `researchMarket()`, `mapTAM()`, `validateICP()`, `query()`

---

## Workflow Engine

Located in `src/lib/workflow-engine.ts`, the workflow engine orchestrates multi-step operations:

### Predefined Workflows

| Workflow ID | Name | Description |
|-------------|------|-------------|
| `gtmStrategy` | Build GTM Strategy | Research → TAM Mapping → ICP Validation → Store Results |
| `campaignOptimization` | Optimize Campaigns | List Campaigns → Get Replies → Query Insights → Analyze |
| `icpRefinement` | Refine ICP | Get Replies → Classify → Analyze Patterns → Store Insights |
| `autonomousCampaign` | Autonomous Campaign Launch | Research → Generate Angles → Create Campaign → Upload Leads → Activate |

### Using the Workflow Engine

```typescript
import { workflowEngine } from '@/lib/workflow-engine';

// Execute a workflow
const result = await workflowEngine.execute('gtmStrategy', {
  companyProfile: { name: 'Superwave', /* ... */ }
});

// Check status
const status = workflowEngine.getWorkflowStatus('gtmStrategy');
```

---

## State Management

The application uses React's built-in state management:

- **Local Component State**: `useState` for component-level state
- **No Global State Library**: Props are passed down through component tree
- **Data Fetching**: SWR for server state (configured in api.ts)
- **View Routing**: Centralized in `page.tsx` via `activeView` state

Navigation flow:
1. `Sidebar.tsx` triggers `onViewChange`
2. `page.tsx` updates `activeView` state
3. `renderView()` switch statement renders appropriate component

---

## Testing

**Current State**: No tests are currently implemented in the project.

The README mentions `npm test` and `npm run test:e2e` scripts, but these are not defined in `package.json`.

To add testing, consider:
- **Unit Tests**: Jest + React Testing Library
- **E2E Tests**: Playwright or Cypress
- **Component Tests**: Storybook

---

## Security Considerations

1. **API Keys**: Currently stored in environment variables. For production, use a secrets manager.
2. **CORS**: Backend API must allow requests from the UI origin.
3. **Authentication**: Not currently implemented. The README suggests wrapping with `AuthProvider`.
4. **Input Validation**: Form inputs should be validated before API calls.
5. **XSS Prevention**: React's JSX escaping provides basic protection. Sanitize any HTML content.

---

## Deployment

### OpenClaw Deployment

```bash
# Build static export
npm run build

# Deploy to OpenClaw (from project root)
openclaw deploy ui/dist --name=blitzscale-ui
```

### Custom Deployment

1. Update `next.config.js` rewrites to point to production API
2. Set environment variables
3. Build: `npm run build`
4. Serve: `npm start`

---

## Common Development Tasks

### Adding a New View

1. Create component in `src/components/NewView.tsx`
2. Add nav item in `src/components/Sidebar.tsx`:
   ```typescript
   const navItems = [
     // ... existing items
     { id: 'newview', label: 'New View', icon: IconName },
   ];
   ```
3. Add case in `src/app/page.tsx` `renderView()` switch:
   ```typescript
   case 'newview':
     return <NewView />;
   ```

### Adding a New Chart

1. Import from recharts:
   ```typescript
   import { PieChart, Pie, Cell } from 'recharts';
   ```
2. Wrap in glass-card:
   ```tsx
   <div className="glass-card p-6">
     <ResponsiveContainer width="100%" height={300}>
       <PieChart>{/* ... */}</PieChart>
     </ResponsiveContainer>
   </div>
   ```

### Adding an API Endpoint

1. Add function in `src/lib/api.ts`:
   ```typescript
   export async function newEndpoint(param: string) {
     const res = await fetch(`${API_BASE}/api/new-endpoint?param=${param}`);
     if (!res.ok) throw new Error('Failed');
     return res.json();
   }
   ```
2. Use in component with SWR or direct fetch

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Module not found` | Run `npm install` |
| `Cannot find module '@/components/X'` | Check tsconfig.json paths configuration |
| API calls failing | Verify `NEXT_PUBLIC_API_URL` and backend is running |
| Styles not applying | Ensure `globals.css` is imported in layout.tsx |
| Hot reload not working | Restart dev server with `npm run dev` |

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Recharts Documentation](https://recharts.org/en-US)
- [Lucide Icons](https://lucide.dev/icons/)

---

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Next.js UI/API | `npm run dev` (in `ui/`) | 3000 | Main app; if port 3000 is busy, Next.js auto-selects 3001 |
| Webhook receiver | `npm run dev` (in root `/workspace`) | 3000 (configurable via `PORT`) | Standalone Express server; conflicts with UI on same port |

### Running the dev server

```bash
cd ui && npm run dev
```

All secrets are injected as environment variables by the cloud agent environment. No `.env.local` file is needed — Next.js reads `NEXT_PUBLIC_*` and server-side vars directly from `process.env`.

### Lint

```bash
cd ui && npm run lint
```

Pre-existing warnings (console statements, react-hooks/exhaustive-deps) and one `eqeqeq` error in `admin/domain-assignments/page.tsx` are known and should not be fixed unless specifically requested.

### Build

```bash
cd ui && npm run build
```

`next.config.js` sets `ignoreDuringBuilds: true` for both ESLint and TypeScript, so builds succeed even with lint warnings.

### Testing

No test framework (Jest, Vitest, Playwright) is configured. Manual testing via the browser is the primary verification method.

### SSH key / provisioner gotcha

The `PROVISIONER_SSH_KEY` env var (multi-line PEM) gets truncated to just the header line by Cursor's secret injection. Use `PROVISIONER_SSH_KEY_B64` instead — set it to the base64-encoded single-line representation of the private key. The codebase already supports this in `src/lib/provisioner-env.ts` via `resolveProvisionerSshKey()`. When base64-encoding the key, ensure the PEM END marker reads `KEY` (all caps) — a lowercase `KeY` will pass SSH tests but fail `ssh2` library parsing in Node.js. Validate with `node scripts/validate-provisioner-key.js`.

### Port conflicts

Kill stale Next.js processes before starting the dev server. If port 3000 is occupied, Next.js auto-selects the next available port (3001, 3002, etc.), but static assets may 404 on the fallback port due to stale build cache. Always ensure port 3000 is free: `lsof -ti:3000 | xargs kill` then `npm run dev`.

### Auth flow

Supabase SSR auth with middleware. Unauthenticated users are redirected to `/login`. After login, users without a company are redirected to `/onboarding`. The middleware has a "demo mode" fallback — if `NEXT_PUBLIC_SUPABASE_URL` is unset, auth checks are skipped entirely.
