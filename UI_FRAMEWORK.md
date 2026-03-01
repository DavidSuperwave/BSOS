# BLITZSCALE OS - UI FRAMEWORK & DEPLOYMENT GUIDE

## 🎯 Overview

This document outlines the UI architecture for Blitzscale OS and provides deployment instructions for both local development and OpenClaw cloud hosting.

---

## 🏗️ ARCHITECTURE

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 | React framework with App Router |
| Styling | Tailwind CSS | Utility-first CSS |
| Charts | Recharts | Data visualization |
| Icons | Lucide React | Consistent iconography |
| State | React hooks + SWR | Data fetching & caching |
| Build | Static Export | Deployable to any CDN |

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     APP LAYER (Next.js)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Dashboard  │  │  Campaigns   │  │  ICP Feedback│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  Analytics   │  │   Settings   │                        │
│  └──────────────┘  └──────────────┘                        │
├─────────────────────────────────────────────────────────────┤
│                   SHARED COMPONENTS                         │
│  Sidebar │ MetricCard │ ChartContainer │ StatusBadge      │
├─────────────────────────────────────────────────────────────┤
│                     API LAYER                               │
│  REST Client │ WebSocket │ Error Handling │ Caching        │
├─────────────────────────────────────────────────────────────┤
│                   GTM ENGINE BACKEND                        │
│  Campaigns │ Analytics │ ICP Engine │ Supermemory         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 USER INTERFACE

### Views

#### 1. Dashboard
**Purpose:** Executive overview of all GTM activities

**Components:**
- Metrics grid (total replies, positive rate, active leads, meetings)
- Reply trends chart (7-day line chart)
- Sentiment distribution (pie chart)
- Campaign performance (bar chart)
- Alert feed

**Data Sources:**
- `/api/metrics`
- `/api/analytics/reply-trends`
- `/api/analytics/sentiment`

#### 2. Campaigns
**Purpose:** Full campaign lifecycle management

**Components:**
- Campaign list with status badges
- Create campaign modal
- Activate/pause controls
- Performance metrics per campaign
- Framework selection

**Data Sources:**
- `/api/campaigns`
- `/api/campaigns` (POST)
- `/api/campaigns/:id/activate`
- `/api/campaigns/:id/pause`

#### 3. ICP Feedback
**Purpose:** AI-powered targeting optimization

**Components:**
- Self-learning loop visualization
- AI insight cards
- ICP fit radar chart
- Persona performance comparison
- Targeting recommendations

**Data Sources:**
- `/api/icp/insights`
- `/api/icp/generate` (POST)
- `/api/icp/personas`

#### 4. Analytics
**Purpose:** Deep-dive reporting (placeholder for future)

**Components:**
- Date range selector
- Export functionality
- Chart placeholders

#### 5. Settings
**Purpose:** System configuration

**Components:**
- Company profile
- API key management
- Notification preferences
- Integration status
- Security settings

**Data Sources:**
- `/api/companies/:slug`
- `/api/companies/:slug/settings` (PUT)

---

## 🎨 DESIGN SYSTEM

### Color Palette

```css
/* Primary Brand */
--obsidian-500: #344532;
--obsidian-900: #161f16;

/* Accents */
--accent-emerald: #10b981;   /* Success, positive */
--accent-blue: #3b82f6;      /* Info, links */
--accent-rose: #f43f5e;      /* Errors, negative */
--accent-amber: #f59e0b;     /* Warnings, paused */
--accent-violet: #8b5cf6;    /* Purple accents */

/* Backgrounds */
--bg-primary: #161f16;       /* Main background */
--bg-secondary: rgba(255,255,255,0.05);  /* Cards */
--bg-hover: rgba(255,255,255,0.1);       /* Hover states */

/* Text */
--text-primary: #ffffff;
--text-secondary: rgba(255,255,255,0.7);
--text-muted: rgba(255,255,255,0.5);
```

### Typography

```css
/* Font Stack */
font-family: 'Inter', system-ui, sans-serif;

/* Scale */
--text-xs: 0.75rem;     /* 12px - Captions */
--text-sm: 0.875rem;    /* 14px - Body small */
--text-base: 1rem;      /* 16px - Body */
--text-lg: 1.125rem;    /* 18px - Lead */
--text-xl: 1.25rem;     /* 20px - H3 */
--text-2xl: 1.5rem;     /* 24px - H2 */
--text-3xl: 1.875rem;   /* 30px - H1 */
```

### Component Patterns

#### Glass Card
```tsx
<div className="glass-card p-6">
  <h2 className="text-lg font-semibold text-white">Title</h2>
  <div className="mt-4">{content}</div>
</div>
```

#### Metric Card
```tsx
<div className="metric-card">
  <div className="flex items-start justify-between">
    <Icon className="w-5 h-5 text-accent-emerald" />
    <TrendIndicator value={change} />
  </div>
  <p className="text-sm text-white/60">{label}</p>
  <p className="text-2xl font-bold text-white">{value}</p>
</div>
```

#### Status Badge
```tsx
<span className="status-badge status-active">Active</span>
<span className="status-badge status-paused">Paused</span>
<span className="status-badge status-draft">Draft</span>
```

---

## 🔌 API INTEGRATION

### REST Client Pattern

```typescript
// lib/api.ts
export async function fetchCampaigns(companySlug: string) {
  const res = await fetch(
    `${API_BASE}/api/campaigns?company=${companySlug}`
  );
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}
```

### SWR for Data Fetching

```typescript
// hooks/useCampaigns.ts
import useSWR from 'swr';
import { fetchCampaigns } from '@/lib/api';

export function useCampaigns(companySlug: string) {
  const { data, error, isLoading } = useSWR(
    ['campaigns', companySlug],
    () => fetchCampaigns(companySlug),
    { refreshInterval: 30000 } // Auto-refresh every 30s
  );
  
  return { campaigns: data, error, isLoading };
}
```

### Error Handling

```typescript
// components/ErrorBoundary.tsx
export function APIError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="glass-card p-8 text-center">
      <AlertCircle className="w-12 h-12 text-accent-rose mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-white">Error loading data</h3>
      <p className="text-white/60 mt-2">{error.message}</p>
      <button onClick={retry} className="btn-primary mt-4">
        Retry
      </button>
    </div>
  );
}
```

---

## 🚀 DEPLOYMENT OPTIONS

### Option 1: Local Development

```bash
cd automation/gtm-engine/ui
npm install
npm run dev
# http://localhost:3000
```

### Option 2: Static Export (CDN)

```bash
npm run build
# Output: out/ directory with static files
# Deploy to: Vercel, Netlify, Cloudflare Pages
```

### Option 3: OpenClaw Deployment (RECOMMENDED)

```bash
# 1. Build static export
npm run build

# 2. Deploy via OpenClaw
openclaw deploy out --name=blitzscale-dashboard

# 3. Configure environment
openclaw env:set NEXT_PUBLIC_API_URL=https://api.blitzscale.io
```

### Option 4: Docker Container

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t blitzscale-ui .
docker run -p 3000:3000 blitzscale-ui
```

---

## 🔐 SECURITY CONSIDERATIONS

### API Key Handling

```typescript
// ❌ NEVER do this
const API_KEY = 'sk-1234567890';

// ✅ Use environment variables
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;
```

### Authentication Flow

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token');
  
  if (!token && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}
```

---

## 📊 PERFORMANCE OPTIMIZATION

### Code Splitting

```typescript
// Lazy load heavy components
const Analytics = dynamic(() => import('@/components/Analytics'), {
  loading: () => <LoadingSpinner />,
});
```

### Image Optimization

```tsx
import Image from 'next/image';

<Image
  src="/logo.png"
  width={120}
  height={40}
  alt="Blitzscale"
  priority
/>
```

### Chart Optimization

```tsx
// Use ResponsiveContainer for automatic sizing
// Debounce resize events
// Lazy load charts below the fold
```

---

## 🧪 TESTING STRATEGY

### Unit Tests

```typescript
// __tests__/Dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import Dashboard from '@/components/Dashboard';

test('renders dashboard metrics', () => {
  render(<Dashboard />);
  expect(screen.getByText('Total Replies')).toBeInTheDocument();
});
```

### E2E Tests

```typescript
// cypress/e2e/campaigns.cy.ts
describe('Campaign Management', () => {
  it('creates a new campaign', () => {
    cy.visit('/campaigns');
    cy.get('[data-testid="create-campaign"]').click();
    cy.get('input[name="name"]').type('Test Campaign');
    cy.get('button[type="submit"]').click();
    cy.contains('Campaign created');
  });
});
```

---

## 🔄 CI/CD PIPELINE

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy UI

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Deploy to OpenClaw
        run: openclaw deploy out --name=blitzscale-ui
        env:
          OPENCLAW_TOKEN: ${{ secrets.OPENCLAW_TOKEN }}
```

---

## 📈 FUTURE ENHANCEMENTS

### Phase 2 Features
- [ ] Real-time WebSocket updates
- [ ] Collaborative campaign editing
- [ ] Advanced analytics (cohort, funnel)
- [ ] Mobile app (React Native)
- [ ] White-label customization

### Phase 3 Features
- [ ] AI chat interface (Claude integration)
- [ ] Voice commands
- [ ] AR/VR data visualization
- [ ] Predictive campaign suggestions

---

## 📞 SUPPORT

For issues or questions:
1. Check OPERATIONAL_GUIDE.md
2. Review API documentation
3. Contact: Blitzscale OS team

---

*Blitzscale OS UI Framework v2.0*  
*Last Updated: 2026-02-09*
