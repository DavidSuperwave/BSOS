# Admin Dashboard Architecture Draft
## Multi-Tenant Domain Management + Supermemory Integration

---

## Core Entities

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     USERS       │────▶│   COMPANIES     │◄────│    DOMAINS      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ email           │     │ name            │     │ inboxing_id     │
│ role            │     │ slug            │     │ domain_name     │
│ company_id      │     │ settings        │     │ status          │
│ permissions     │     │ inboxing_key    │     │ mailbox_count   │
└─────────────────┘     │ supermemory_key │     │ assigned_to     │
                        │ limits          │     │ company_id      │
                        └─────────────────┘     │ tags            │
                                │               │ created_at      │
                                │               └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  API_USAGE_LOG  │
                        ├─────────────────┤
                        │ id              │
                        │ company_id      │
                        │ user_id         │
                        │ endpoint        │
                        │ request_count   │
                        │ date            │
                        └─────────────────┘
```

---

## User Roles & Permissions

| Role | Domains | Users | API Keys | Billing | Supermemory |
|------|---------|-------|----------|---------|-------------|
| **Super Admin** | All | All | All | All | All |
| **Company Admin** | Own company | Own company | Own | View | Own |
| **Company User** | View assigned | - | - | - | View assigned |
| **Viewer** | View | - | - | - | View |

---

## Admin Dashboard Pages

### 1. OVERVIEW / ADMIN HOME
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ADMIN DASHBOARD                                      [Search] [Notifications]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │   688        │ │    42        │ │   1,240      │ │   98.5%      │       │
│  │ Total        │ │ Companies    │ │ Active       │ │ API Uptime   │       │
│  │ Domains      │ │ Onboarded    │ │ Mailboxes    │ │ (24h)        │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ DOMAIN ALLOCATION       │  │ API USAGE (Last 7 Days)                 │  │
│  │                         │  │                                         │  │
│  │ [████████░░░░░░░░░░]    │  │ ████████████████████                    │  │
│  │ 668 / 673 used (99%)    │  │ ██████████████████                      │  │
│  │ 5 slots remaining       │  │ ███████████████                         │  │
│  │                         │  │ ██████████████                          │  │
│  │ [Alert: Low slots]      │  │ ████████████                            │  │
│  │                         │  │ Mon  Tue  Wed  Thu  Fri  Sat  Sun       │  │
│  │ Button: [Provision More]│  │                                         │  │
│  └─────────────────────────┘  └─────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ RECENT ACTIVITY                                                     │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ 🔵 Company "Superwave" assigned 5 domains                           │   │
│  │ 🟢 Domain "usecss-i.com" uploaded to Instantly                      │   │
│  │ 🟡 User "john@example.com" approaching API limit                    │   │
│  │ 🔴 Domain "failed-domain.com" setup failed                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. DOMAIN MANAGEMENT
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DOMAINS                                        [+ Create] [Import] [Export]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [All ▼] [Status: Active ▼] [Platform: Any ▼]     [🔍 Search domains...]   │
│                                                                             │
│  □  Domain              Company       Status    Mailboxes  Platform   Actions│
│  ───────────────────────────────────────────────────────────────────────────│
│  □  usecss-i.com        Superwave     🟢 Active  49/49     Instantly  [⋮]   │
│  □  trustedagency...    Shield Fund   🟢 Active  49/49     -          [⋮]   │
│  □  vesselbridgevc.com  VesselBridge  🟢 Active  49/49     EmailBison [⋮]   │
│  □  new-domain.com      Unassigned    🟡 Pending 0/49      -          [⋮]   │
│  □  failed-setup.com    -             🔴 Failed   0/0       -          [⋮]   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ BULK ACTIONS:  [Assign to Company] [Upload to Platform] [Add Tags]  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Page 1 of 69                    [Previous] 1 2 3 ... 69 [Next]            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Domain Detail Slide-out Panel
```
┌─────────────────────────────────────────────────────────────┐
│  usecss-i.com                                    [× Close]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STATUS: 🟢 Active (since Feb 13, 2026)                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ASSIGNED COMPANY:                                          │
│  [Superwave ▼]                    [Update]                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  MAILBOXES: 49 created                                      │
│  [Download CSV] (available)                                 │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  PLATFORM UPLOAD:                                           │
│  Status: ✅ Uploaded to "sw brand" (Instantly)              │
│  Uploaded: 49/49 mailboxes                                  │
│  Warmup: Enabled                                            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  SUPERMEMORY ASSIGNMENT:                                    │
│  Document tags: [domain:usecss-i] [company:superwave]       │
│  Searchable: Yes                                            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  REDIRECT: https://css-i.co.za/                             │
│  Nameservers: nadia.ns.cloudflare.com, odin.ns...           │
│                                                             │
│  [Delete Domain] [Recreate] [View Logs]                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. COMPANY MANAGEMENT
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMPANIES                                    [+ Create Company] [Invite]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Company        Users  Domains  API Usage   Storage    Status        │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ Superwave      5       12      2,341 req   450 MB     🟢 Active     │   │
│  │ Shield Funding 3       8       1,203 req   280 MB     🟢 Active     │   │
│  │ VesselBridge   2       6       892 req     120 MB     🟢 Active     │   │
│  │ TestCo         1       0       45 req      0 MB       🟡 Trial      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Click a company to view details                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Company Detail Page
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUPERWAVE                              [Edit] [Suspend] [Delete]           │
│  Created: Jan 15, 2026  |  Plan: Pro  |  Billing: Active                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TABS: [Overview] [Users] [Domains] [API Keys] [Usage] [Settings]           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ USERS (5)                                                             │ │
│  │ ───────────────────────────────────────────────────────────────────── │ │
│  │ Name              Email                 Role          Last Active     │ │
│  │ John Smith        john@superwave.io     Admin         2 min ago       │ │
│  │ Sarah Chen        sarah@superwave.io    User          1 hour ago      │ │
│  │ Mike Johnson      mike@superwave.io     User          3 hours ago     │ │
│  │ [+ Invite User]                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ ASSIGNED DOMAINS (12)                                                 │ │
│  │ [Manage Domains]                                                      │ │
│  │                                                                       │ │
│  │ usecss-i.com      🟢 Active    49 mailboxes    Instantly              │ │
│  │ superwave-mail.co 🟢 Active    49 mailboxes    -                      │ │
│  │ sw-outreach.net   🟢 Active    49 mailboxes    Smartlead              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ API CONFIGURATION                                                     │ │
│  │ ───────────────────────────────────────────────────────────────────── │ │
│  │ Inboxing API Key:     inb_live_****_BoG (Active)                      │ │
│  │ Supermemory API Key:  sm_****_xyz (Active)                            │ │
│  │ Rate Limit:           120 req/min                                     │ │
│  │ Current Usage:        45 req/min (38%)                                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. USER MANAGEMENT
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USERS                                          [+ Create User] [Bulk]      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Name              Email                  Company       Role      Status    │
│  ────────────────────────────────────────────────────────────────────────── │
│  John Smith        john@superwave.io      Superwave     Admin     🟢 Active │
│  Sarah Chen        sarah@superwave.io     Superwave     User      🟢 Active │
│  Test User         test@example.com       TestCo        User      🟡 Pending│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 5. API USAGE & MONITORING
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API MONITORING                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TIME RANGE: [Last 24h ▼]                                                   │
│                                                                             │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐   │
│  │ 45,231              │ │ 98.7%               │ │ 12                  │   │
│  │ Total Requests      │ │ Success Rate        │ │ Errors              │   │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘   │
│                                                                             │
│  REQUESTS BY ENDPOINT (24h)                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  GET /domains           ████████████████████████████████████████  18,402   │
│  POST /domains          ██████████████                           8,234    │
│  GET /domains/{id}      ██████████                               6,123    │
│  POST /upload           ██████                                   3,891    │
│  GET /platforms         ██                                       1,234    │
│                                                                             │
│  USAGE BY COMPANY (24h)                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Superwave              ████████████████████████████████         18,402   │
│  Shield Funding         ████████████████████                     12,340   │
│  VesselBridge           ██████████████                            8,234   │
│  Other                  ██████                                    6,255   │
│                                                                             │
│  RECENT ERRORS                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  3:42 PM  Superwave     POST /domains       429 Rate Limited              │
│  2:15 PM  TestCo        GET /domains/{id}   404 Domain not found          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6. SUPERMEMORY ASSIGNMENT
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUPERMEMORY INTEGRATION                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DOCUMENT CATEGORIES                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DOMAIN DOCUMENTATION              [+ New Doc] [Auto-Generate]       │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ • Domain Setup Guides (12 docs)     [Manage]                        │   │
│  │ • Platform Connection Guides (4)    [Manage]                        │   │
│  │ • Troubleshooting Playbooks (3)     [Manage]                        │   │
│  │ • API Reference                     [View]                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  AUTO-TAGGING RULES                                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  When domain created → Tag: [domain:{domain_name}] [company:{company_slug}] │
│  When uploaded to platform → Tag: [platform:{platform_name}]                │
│  When status changes → Tag: [status:{status}]                               │
│                                                                             │
│  COMPANY KNOWLEDGE BASES                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Company       Documents    Last Updated    Quick Search                    │
│  Superwave     45          2 hours ago     [Search...]                      │
│  Shield        23          1 day ago       [Search...]                      │
│  VesselBridge  12          3 days ago      [Search...]                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Needed (Admin)

```typescript
// Admin Dashboard APIs

// Overview
GET /api/admin/stats                      // Domain, company, usage stats
GET /api/admin/activity                   // Recent activity feed
GET /api/admin/alerts                     // System alerts (low slots, failures)

// Domain Management
GET /api/admin/domains                    // List all domains (paginated)
POST /api/admin/domains                   // Create domain
PATCH /api/admin/domains/:id/assign       // Assign to company
PATCH /api/admin/domains/:id/tags         // Update tags
DELETE /api/admin/domains/:id             // Delete domain
POST /api/admin/domains/bulk-assign       // Bulk assign to company
POST /api/admin/domains/bulk-upload       // Bulk upload to platform

// Company Management
GET /api/admin/companies                  // List companies
POST /api/admin/companies                 // Create company
GET /api/admin/companies/:id              // Company details
PATCH /api/admin/companies/:id            // Update company
DELETE /api/admin/companies/:id           // Delete company
GET /api/admin/companies/:id/usage        // Company API usage

// User Management
GET /api/admin/users                      // List users
POST /api/admin/users                     // Create user
PATCH /api/admin/users/:id                // Update user
DELETE /api/admin/users/:id               // Delete user
POST /api/admin/users/:id/invite          // Send invite

// API Usage
GET /api/admin/usage                      // Global usage stats
GET /api/admin/usage/by-company           // Usage by company
GET /api/admin/usage/by-endpoint          // Usage by endpoint
GET /api/admin/usage/realtime             // Real-time metrics

// Supermemory
GET /api/admin/supermemory/docs           // List documents
POST /api/admin/supermemory/sync          // Sync domains to Supermemory
POST /api/admin/supermemory/tag-rules     // Update auto-tagging rules
```

---

## Database Schema Additions

```sql
-- Companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  inboxing_api_key VARCHAR(255) ENCRYPTED,
  supermemory_api_key VARCHAR(255) ENCRYPTED,
  settings JSONB DEFAULT '{}',
  limits JSONB DEFAULT '{"domains": 10, "users": 5, "api_requests": 10000}',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends existing)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  company_id UUID REFERENCES companies(id),
  role VARCHAR(50) DEFAULT 'user', -- super_admin, admin, user, viewer
  permissions JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'active',
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Domain assignments (links inboxing domains to companies)
CREATE TABLE domain_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id VARCHAR(255) NOT NULL, -- inboxing domain ID
  company_id UUID REFERENCES companies(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(domain_id, company_id)
);

-- API usage tracking
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  date DATE DEFAULT CURRENT_DATE,
  hour INTEGER DEFAULT EXTRACT(HOUR FROM NOW()),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supermemory document mappings
CREATE TABLE supermemory_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  document_id VARCHAR(255) NOT NULL,
  domain_id VARCHAR(255),
  tags TEXT[],
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL, -- domain_assigned, user_invited, etc.
  entity_type VARCHAR(100), -- domain, user, company
  entity_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Key Workflows

### 1. Domain Onboarding Flow
```
Admin Dashboard
    ↓
Create Domain (API: POST /domains)
    ↓
Domain status: pending → dns_setup → queued → setting_up → active
    ↓
Assign to Company (API: PATCH /domains/:id/assign)
    ↓
Auto-tag in Supermemory (domain:{name}, company:{slug})
    ↓
Notify company admin (email/webhook)
    ↓
Company user uploads to platform (or auto-upload)
```

### 2. Company Onboarding Flow
```
Create Company
    ↓
Generate API keys (Inboxing + Supermemory)
    ↓
Create company admin user
    ↓
Send invite email with login + API docs
    ↓
Assign starter domains (optional)
    ↓
Setup default Supermemory tags
```

### 3. Supermemory Auto-Assignment Flow
```
Domain Event (created/updated/uploaded)
    ↓
Webhook to Supermemory
    ↓
Create/Update documents:
  - Domain setup guide
  - Platform upload guide
  - Mailbox credentials (when CSV ready)
    ↓
Auto-tag: [domain:{name}] [company:{slug}] [platform:{name}]
    ↓
Available in company knowledge search
```

---

## Next Steps

1. **Review this draft** — Does this cover all requirements?
2. **Prioritize pages** — Which to build first?
3. **Define data sync** — How often to sync with Inboxing API?
4. **Plan Supermemory integration** — Auto-tagging rules?

Ready to refine or start building?
