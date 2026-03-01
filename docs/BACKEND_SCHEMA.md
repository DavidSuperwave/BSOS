# Backend Schema Documentation

> **Last Updated:** 2026-02-10

## Overview

The Blitzscale OS backend uses a hybrid storage architecture:

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Structured Data** | Supabase PostgreSQL | Companies, users, knowledge docs, message queue |
| **Long-Term Memory** | Supermemory | Semantic search, context memory, AI knowledge graphs |
| **Cache/Sessions** | In-memory (Next.js) | Temporary session state, API caching |

---

## Supabase Tables

### 1. `companies`

Stores company/tenant configuration for multi-tenancy.

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plusvibe_workspace_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Fields:**
- `id` - Unique identifier (UUID)
- `name` - Display name (e.g., "Superwave")
- `slug` - URL-safe identifier (e.g., "superwave")
- `plusvibe_workspace_id` - PlusVibe workspace for campaigns
- `settings` - Company-specific configuration (API keys, preferences)

**Example Settings JSON:**
```json
{
  "apiKeys": {
    "plusvibe": "encrypted_key",
    "close": "encrypted_key"
  },
  "agent": {
    "systemPrompt": "Custom prompt for this company...",
    "allowedTools": ["supermemory", "perplexity"],
    "blockedTools": ["filesystem", "exec"]
  },
  "retention": {
    "campaignData": 365,
    "replyData": 180
  }
}
```

### 2. `company_users`

Associates users with companies (many-to-many).

```sql
CREATE TABLE company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);
```

**Roles:**
- `owner` - Full access, can manage settings
- `admin` - Can manage campaigns and users
- `member` - Can view and create campaigns

### 3. `knowledge_documents`

Stores knowledge base articles for companies.

```sql
CREATE TABLE knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Categories:**
- `company_profile` - Company information
- `icp` - Ideal Customer Profile definitions
- `templates` - Email/message templates
- `research` - Market research, competitor analysis
- `analytics` - Performance benchmarks
- `sales` - Objection handling, playbooks
- `general` - Miscellaneous knowledge

### 4. `agent_message_queue`

Message queue for agent communication (dev mode bridge).

```sql
CREATE TABLE agent_message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue TEXT NOT NULL DEFAULT 'gtm:queue:dev',
  session_id TEXT,
  status TEXT DEFAULT 'pending',
  message JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient polling
CREATE INDEX idx_queue_status ON agent_message_queue(queue, status, created_at);
```

**Status Values:**
- `pending` - Waiting to be processed
- `processing` - Currently being handled by agent bridge
- `complete` - Response received
- `error` - Processing failed

**Message JSONB Structure:**
```json
{
  "content": "User's message",
  "context": {
    "companyId": "uuid",
    "userId": "user-id"
  },
  // Added after processing:
  "response": "AI response",
  "processingTime": 5432,
  "childSessionKey": "agent:main:subagent:uuid",
  "error": "Error message if failed"
}
```

---

## Supermemory Namespace Schema

Supermemory uses `containerTags` for namespace isolation.

### Namespace Convention

```
blitzscale:company:{companySlug}:{docType}
```

### Document Types by Namespace

| Namespace | Purpose |
|-----------|---------|
| `blitzscale:company:superwave` | All Superwave documents |
| `blitzscale:company:superwave:campaigns` | Campaign metadata & performance |
| `blitzscale:company:superwave:replies` | Email replies & sentiment |
| `blitzscale:company:superwave:research` | Perplexity research results |
| `blitzscale:company:superwave:icp` | ICP definitions & refinements |
| `blitzscale:company:superwave:knowledge` | General company knowledge |
| `blitzscale:admin:system` | Cross-company admin data |

### Document Structure

When adding to Supermemory:

```typescript
await client.add({
  content: "Document content...",
  containerTags: ["blitzscale:company:superwave", "category:icp"],
  metadata: {
    title: "Document Title",
    category: "icp",
    companyId: "superwave",
    createdAt: "2026-02-10T00:00:00Z",
    source: "manual" | "ai_generated" | "import"
  }
});
```

---

## Architecture: Supabase vs Supermemory

### When to Use Supabase

| Use Case | Why Supabase |
|----------|--------------|
| User/company management | Relational data, foreign keys, auth |
| Message queue | Fast polling, status updates |
| Knowledge CRUD | Simple list/create/update/delete |
| Structured reports | SQL queries, aggregations |

### When to Use Supermemory

| Use Case | Why Supermemory |
|----------|-----------------|
| Semantic search | "Find docs about pricing objections" |
| AI context retrieval | Automatic relevance ranking |
| Conversation memory | Track evolving facts over time |
| Cross-document insights | Graph relationships between facts |

### The "Unlimited Context" Question

**Q: Why use Supermemory if we have unlimited context?**

**A:** Supermemory isn't just storage—it's intelligence:

1. **Semantic Search** - Find relevant info without exact keywords
2. **Automatic Forgetting** - Outdated info fades, current info stays
3. **Relationship Graphs** - Connect "CEO changed" to "new strategy needed"
4. **Evolving Facts** - Handle contradictions gracefully (old vs new info)
5. **Cross-Session Memory** - Remember across browser sessions, devices, users

Supabase = **Structured Data** (who, what, when)
Supermemory = **Knowledge Intelligence** (meaning, relationships, evolution)

---

## Row-Level Security (RLS)

### Companies Table

```sql
-- Read: Users can see companies they belong to
CREATE POLICY "Users can view their companies" ON companies
  FOR SELECT USING (
    id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()::text
    )
  );

-- Write: Only owners can modify
CREATE POLICY "Owners can modify companies" ON companies
  FOR UPDATE USING (
    id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()::text AND role = 'owner'
    )
  );
```

### Knowledge Documents

```sql
-- Read: Users can see docs from their companies
CREATE POLICY "Users can view company docs" ON knowledge_documents
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()::text
    )
  );
```

### Agent Message Queue

```sql
-- Service role only (no user access)
-- Queue is accessed via server-side operations
ALTER TABLE agent_message_queue ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role access" ON agent_message_queue
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Data Flow

### 1. User Sends Message (Web UI)

```
User → API Route → Supabase Queue → Agent Bridge → OpenClaw → Response
                                                         ↓
                   Web UI ← API Route ← Supabase Queue ←─┘
```

### 2. Knowledge Lookup

```
User Query → Supermemory Search → Relevant Docs → AI Context
                    ↓
        Supabase (if structured data needed)
```

### 3. Campaign Data

```
PlusVibe API → Transform → Display in UI
                  ↓
        (Optional) Store insights in Supermemory
```

---

## Table Summary

| Table | Records | Purpose |
|-------|---------|---------|
| `companies` | ~10-100 | Multi-tenant company config |
| `company_users` | ~100-1000 | User-company relationships |
| `knowledge_documents` | ~100-10000 | Knowledge base articles |
| `agent_message_queue` | ~1000-10000 | Transient message queue |

All tables are necessary for the current architecture. No tables should be removed.

---

## Future Considerations

### Planned Tables

- `campaigns_cache` - Local cache of PlusVibe campaign data
- `analytics_snapshots` - Historical performance data
- `automation_logs` - Audit trail for automated actions

### Scalability Notes

- Message queue should be pruned periodically (completed messages > 7 days)
- Knowledge documents may need full-text search index for large datasets
- Supermemory handles most semantic search needs, reducing Supabase load
