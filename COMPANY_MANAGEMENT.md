# Blitzscale OS - Company Management System

## Overview

This document describes how to add new companies to Blitzscale OS, including onboarding flow, file generation, and multi-tenant isolation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BLITZSCALE OS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Superwave   │  │  Company B   │  │  Company C   │          │
│  │  (Default)   │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SHARED INFRASTRUCTURE                     ││
│  │  • Supabase (Database, Auth, Realtime)                      ││
│  │  • PlusVibe API (Campaign Management)                       ││
│  │  • Supermemory (Knowledge Base) - Namespaced per company    ││
│  │  • OpenClaw Gateway (Agent Bridge)                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Company Data Model

### Supabase Tables

#### `companies`
```sql
CREATE TABLE companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier
    domain TEXT,                -- Company domain for email matching
    plusvibe_workspace_id TEXT, -- PlusVibe workspace for this company
    supermemory_namespace TEXT, -- Supermemory namespace (default: slug)
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example company
INSERT INTO companies (name, slug, domain, plusvibe_workspace_id) VALUES
    ('Superwave', 'superwave', 'superwave.ai', '678eb62a071ff7544034bcde');
```

#### `company_users`
```sql
CREATE TABLE company_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id),
    user_id UUID,  -- References auth.users
    role TEXT DEFAULT 'member',  -- 'owner', 'admin', 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## Adding a New Company

### Method 1: API Endpoint

```typescript
// POST /api/companies
{
  "name": "Acme Corp",
  "slug": "acme",
  "domain": "acme.com",
  "plusvibe_workspace_id": "optional-workspace-id",
  "owner_email": "owner@acme.com"
}
```

### Method 2: Admin Dashboard

1. Navigate to Settings → Companies
2. Click "Add Company"
3. Fill in company details
4. Assign owner

### Method 3: CLI Script

```bash
cd automation/gtm-engine
node scripts/add-company.js --name "Acme Corp" --slug acme --domain acme.com
```

---

## Onboarding Flow

### Step 1: Company Creation

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEW COMPANY ONBOARDING                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Basic Info                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Company Name: [________________]                            ││
│  │ Company Slug: [________________] (URL: /c/slug)            ││
│  │ Domain:       [________________] (for email matching)       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Step 2: PlusVibe Integration                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [ ] Use existing workspace: [dropdown]                      ││
│  │ [ ] Create new workspace                                    ││
│  │ [ ] Skip for now                                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Step 3: Knowledge Base                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [ ] Initialize with templates                               ││
│  │ [ ] Import from existing docs                               ││
│  │ [ ] Start empty                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Step 4: Invite Team                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Email 1: [________________] Role: [Owner ▼]                 ││
│  │ Email 2: [________________] Role: [Admin ▼]                 ││
│  │ [+ Add Another]                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│                              [Create Company →]                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Step 2: File Generation

When a company is created, the following are automatically generated:

1. **Supermemory Namespace**
   - Creates isolated memory space: `blitzscale:company:{slug}`
   - Initializes with company context

2. **Database Records**
   - Company record in `companies` table
   - Owner record in `company_users` table
   - Default settings in `company_settings`

3. **Knowledge Base Templates**
   - ICP (Ideal Customer Profile) template
   - Campaign templates
   - Email sequence templates

---

## Company Isolation

### Supermemory Namespacing

Each company gets an isolated namespace in Supermemory:

```typescript
// lib/supermemory-namespace.ts
export function getCompanyNamespace(companyId: string): string {
  return `blitzscale:company:${companyId}`;
}

export async function addToCompanyMemory(
  companyId: string, 
  content: string,
  tags: string[] = []
) {
  const namespace = getCompanyNamespace(companyId);
  
  await fetch('https://api.supermemory.com/v3/memories', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content,
      containerTags: [namespace, ...tags]
    })
  });
}

export async function searchCompanyMemory(companyId: string, query: string) {
  const namespace = getCompanyNamespace(companyId);
  
  const response = await fetch('https://api.supermemory.com/v3/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      filters: { containerTags: [namespace] }
    })
  });
  
  return response.json();
}
```

### Database Row-Level Security

```sql
-- Companies can only see their own data
CREATE POLICY "Company isolation" ON knowledge_documents
    FOR ALL
    USING (
      company_id IN (
        SELECT company_id FROM company_users 
        WHERE user_id = auth.uid()
      )
    );
```

---

## API Endpoints

### Company Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies` | GET | List all companies (admin only) |
| `/api/companies` | POST | Create new company |
| `/api/companies/[id]` | GET | Get company details |
| `/api/companies/[id]` | PATCH | Update company |
| `/api/companies/[id]` | DELETE | Delete company |
| `/api/companies/[id]/users` | GET | List company users |
| `/api/companies/[id]/users` | POST | Invite user to company |

### Company-Scoped Resources

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies/[id]/campaigns` | GET | List campaigns for company |
| `/api/companies/[id]/knowledge` | GET | List knowledge docs |
| `/api/companies/[id]/knowledge` | POST | Add knowledge doc |
| `/api/companies/[id]/chat` | POST | Chat with company agent |

---

## Sidebar Integration

### Company Switcher Component

```tsx
// components/company-switcher.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function CompanySwitcher() {
  const [companies, setCompanies] = useState([]);
  const [currentCompany, setCurrentCompany] = useState(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Fetch user's companies
    fetch('/api/user/companies')
      .then(res => res.json())
      .then(data => setCompanies(data.companies));
  }, []);

  const switchCompany = (companyId: string) => {
    // Update URL to include company context
    const newPath = pathname.replace(/^\/c\/[^/]+/, `/c/${companyId}`);
    router.push(newPath);
  };

  return (
    <select 
      value={currentCompany?.id || ''} 
      onChange={(e) => switchCompany(e.target.value)}
      className="company-switcher"
    >
      {companies.map(company => (
        <option key={company.id} value={company.id}>
          {company.name}
        </option>
      ))}
      <option value="__new__">+ Add Company</option>
    </select>
  );
}
```

### Fixing the "Add Company" Button

The sidebar button issue is likely due to:
1. Missing click handler
2. CSS pointer-events issue
3. Component not properly mounted

**Fix in `app-shell.tsx`:**

```tsx
// Look for the "Add Company" button and ensure it has:
<button
  onClick={() => setShowAddCompanyModal(true)}
  className="sidebar-add-company-btn"
  style={{ pointerEvents: 'auto' }}  // Ensure clicks work
>
  + Add Company
</button>
```

---

## Scripts

### add-company.js

```javascript
// automation/gtm-engine/scripts/add-company.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function addCompany({ name, slug, domain, ownerEmail }) {
  console.log(`Creating company: ${name}`);

  // 1. Create company record
  const { data: company, error } = await supabase
    .from('companies')
    .insert({
      name,
      slug,
      domain,
      supermemory_namespace: `blitzscale:company:${slug}`,
      settings: {
        created_at: new Date().toISOString(),
        features: ['campaigns', 'knowledge', 'agent']
      }
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ Company created: ${company.id}`);

  // 2. Initialize Supermemory namespace
  await initializeSupermemory(company);

  // 3. Create default knowledge docs
  await createDefaultKnowledge(company);

  // 4. Send invite to owner
  if (ownerEmail) {
    await sendOwnerInvite(company, ownerEmail);
  }

  return company;
}

async function initializeSupermemory(company) {
  const namespace = `blitzscale:company:${company.slug}`;
  
  // Add initial context
  await fetch('https://api.supermemory.com/v3/memories', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: `Company: ${company.name}\nDomain: ${company.domain}\nCreated: ${new Date().toISOString()}`,
      containerTags: [namespace, 'company-info']
    })
  });
  
  console.log(`✅ Supermemory namespace initialized: ${namespace}`);
}

async function createDefaultKnowledge(company) {
  const templates = [
    {
      title: 'Ideal Customer Profile (ICP)',
      content: '# ICP Template\n\n## Target Industries\n- \n\n## Company Size\n- \n\n## Key Pain Points\n- \n\n## Decision Makers\n- ',
      category: 'icp'
    },
    {
      title: 'Campaign Templates',
      content: '# Campaign Templates\n\n## Cold Email Sequence\n1. Initial outreach\n2. Follow-up 1\n3. Follow-up 2\n\n## LinkedIn Sequence\n1. Connection request\n2. First message\n3. Value add',
      category: 'campaigns'
    }
  ];

  for (const template of templates) {
    await supabase
      .from('knowledge_documents')
      .insert({
        ...template,
        company_id: company.id
      });
  }
  
  console.log(`✅ Default knowledge docs created`);
}

// CLI
const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i += 2) {
  params[args[i].replace('--', '')] = args[i + 1];
}

if (!params.name || !params.slug) {
  console.log('Usage: node add-company.js --name "Company" --slug company [--domain example.com]');
  process.exit(1);
}

addCompany(params).then(() => {
  console.log('\n✅ Company setup complete!');
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
```

---

## Environment Variables

Add these to `.env.local` for multi-company support:

```env
# Multi-tenant configuration
ENABLE_MULTI_COMPANY=true
DEFAULT_COMPANY_SLUG=superwave
```

---

## Migration Path

### From Single Company → Multi-Company

1. Create `companies` table
2. Insert current company (Superwave) as default
3. Update all existing records with `company_id`
4. Enable RLS policies
5. Update API routes to be company-aware

```sql
-- Migration script
-- Step 1: Create companies table
CREATE TABLE companies (...);

-- Step 2: Insert default company
INSERT INTO companies (name, slug, plusvibe_workspace_id)
VALUES ('Superwave', 'superwave', '678eb62a071ff7544034bcde')
RETURNING id;

-- Step 3: Update existing knowledge docs
UPDATE knowledge_documents 
SET company_id = (SELECT id FROM companies WHERE slug = 'superwave')
WHERE company_id IS NULL;
```

---

## Checklist: Adding a New Company

- [ ] Create company record in `companies` table
- [ ] Initialize Supermemory namespace
- [ ] Create/link PlusVibe workspace
- [ ] Generate default knowledge base templates
- [ ] Send owner invite
- [ ] Configure company settings
- [ ] Test company isolation
- [ ] Verify sidebar switching works

---

*Document Version: 1.0*
*Last Updated: February 10, 2026*
