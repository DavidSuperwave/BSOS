# 🎨 BLITZSCALE OS - UI

Modern React dashboard for the GTM Engine. Monitor campaigns, manage multi-company operations, and automate your GTM workflows.

## ✅ Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Dashboard** | ✅ Complete | Real-time metrics, active campaigns, quick actions |
| **Campaigns** | ✅ Complete | List, create, activate, pause campaigns |
| **Analytics** | ✅ Complete | Reply trends, sentiment distribution, best time to send |
| **Company Settings** | ✅ Complete | Multi-project PlusVibe configuration |
| **Knowledge Base** | ✅ Complete | Document management |
| **Agent Chat** | ✅ Complete | Julian AI interface |
| **Settings** | ✅ Complete | API status, general settings, notifications |

---

## 🚀 Quick Start

### Local Development

```bash
cd automation/gtm-engine/ui

# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

### Build for Production

```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with providers
│   │   ├── page.tsx                # Main chat/agent interface
│   │   ├── globals.css             # Tailwind styles
│   │   ├── (auth)/                 # Auth pages (login, signup)
│   │   ├── agent/                  # Agent chat page
│   │   ├── analytics/              # Analytics dashboard ✅
│   │   ├── campaigns/              # Campaign management ✅
│   │   ├── dashboard/              # Main dashboard ✅
│   │   ├── knowledge/              # Knowledge base
│   │   └── settings/               # Settings page ✅
│   ├── components/
│   │   ├── app-shell.tsx           # Layout shell with sidebar
│   │   ├── Campaigns.tsx           # Campaign list component ✅
│   │   ├── Settings.tsx            # Settings UI ✅
│   │   ├── CompanySettings.tsx     # Company/PlusVibe config ✅
│   │   ├── agent-chat.tsx          # AI chat interface
│   │   └── ui/                     # UI components (cards, buttons, etc)
│   ├── lib/
│   │   ├── hooks.ts                # React hooks (SWR data fetching)
│   │   ├── plusvibe-project.ts     # Multi-project PlusVibe support ✅
│   │   ├── api.ts                  # API client utilities
│   │   └── env.ts                  # Environment config
│   └── app/api/                    # API routes
│       ├── plusvibe/               # PlusVibe integration
│       ├── companies/              # Company CRUD ✅
│       ├── campaigns/              # Campaign endpoints
│       └── ...
├── prisma/
│   └── schema.prisma               # Database schema ✅
├── package.json
└── next.config.js
```

---

## 🔌 API Integration

The UI connects to multiple backends:

### PlusVibe API
- Campaign management
- Reply monitoring
- Multi-project support (per-company credentials)

### Close CRM
- Lead creation from interested replies
- Contact management

### Supermemory
- Knowledge storage
- Document indexing

### Supabase
- PostgreSQL database
- Company/User management

---

## 🎨 Design System

### Colors
- **Obsidian Green** (`#344532`): Primary brand color
- **Accent Emerald** (`#10b981`): Success, positive metrics
- **Accent Blue** (`#3b82f6`): Information, links
- **Accent Rose** (`#f43f5e`): Errors, negative metrics
- **Accent Amber** (`#f59e0b`): Warnings, paused states

### Components

All components use Tailwind CSS with consistent styling:
```jsx
<Card className="border-border bg-card">
  <CardContent className="p-6">
    <h2 className="text-lg font-semibold text-foreground">Title</h2>
    <p className="text-muted-foreground">Content</p>
  </CardContent>
</Card>
```

---

## 🔧 Key Features Implemented

### 1. Multi-Project PlusVibe Support ✅
Each company can have its own PlusVibe credentials:
- Company-specific API keys
- Workspace isolation
- Per-project campaign management

**Files:**
- `lib/plusvibe-project.ts` - Credential resolution
- `components/CompanySettings.tsx` - Configuration UI
- `app/api/plusvibe/*` - Project-aware API routes

### 2. Analytics Dashboard ✅
- Reply trend visualization (AreaChart)
- Sentiment distribution (PieChart)
- Best time to send analysis (BarChart)
- Campaign performance comparison

**File:** `app/analytics/page.tsx`

### 3. ICP Insights ✅
- ICP fit score radar chart
- Persona performance analysis
- AI-generated insights
- Self-learning loop visualization

**File:** `components/ICPFeedback.tsx`

### 4. Campaign Management ✅
- List all campaigns
- Activate/pause campaigns
- Create new campaigns
- View campaign stats

**File:** `components/Campaigns.tsx`

---

## 🌐 Deployment

### Build Static Export

```bash
npm run build
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Canonical app URL used in auth email redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role |
| `PLUSVIBE_API_KEY` | Yes | PlusVibe API key |
| `PLUSVIBE_WORKSPACE_ID` | Yes | PlusVibe workspace |
| `CLOSE_API_KEY` | Yes | Close CRM API key |
| `SUPERMEMORY_API_KEY` | Yes | Supermemory API key |
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram notifications |

### Supabase Auth URL Configuration (production)

Set these in Supabase **Auth → URL Configuration**:

- **Site URL**: `https://blitzscaleos.com`
- **Redirect URLs**:
  - `https://blitzscaleos.com/api/auth/callback**`
  - `http://localhost:3000/api/auth/callback**`
  - `https://*-<your-vercel-team-slug>.vercel.app/api/auth/callback**`

Set `NEXT_PUBLIC_APP_URL=https://blitzscaleos.com` in Vercel so signup and reset-password emails always use your main domain.

For branded sender emails (for example `no-reply@blitzscaleos.com`), configure custom SMTP in Supabase **Auth → SMTP Settings**.

---

## 🧪 Testing

```bash
# Run dev server for testing
npm run dev

# Access points:
# - http://localhost:3000 - Main app
# - http://localhost:3000/dashboard - Dashboard
# - http://localhost:3000/analytics - Analytics
# - http://localhost:3000/campaigns - Campaigns
# - http://localhost:3000/icp - ICP Insights
# - http://localhost:3000/settings - Settings
```

---

## 📝 Recent Updates

### 2026-02-10
- ✅ Multi-project PlusVibe support
- ✅ Company settings with API key configuration
- ✅ Analytics page with reply trends & sentiment charts
- ✅ ICP insights with radar charts and persona analysis
- ✅ Database schema updated for project-level credentials

---

## 🚀 Next Steps

1. Run Prisma migration: `npx prisma migrate dev`
2. Test PlusVibe integration with real credentials
3. Add real-time WebSocket updates
4. Implement A/B testing framework

---

Built with Next.js 14, Tailwind CSS, Recharts, and Prisma.
