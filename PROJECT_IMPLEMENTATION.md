# Project-Level PlusVibe Implementation
**Status:** In Progress  
**Started:** 2026-02-10  
**Owner:** Julian

---

## Overview

Implement multi-project support for PlusVibe campaigns where each project/company can have its own:
- PlusVibe API key
- PlusVibe Workspace ID
- Campaigns isolated by project

---

## Current State (As of 2026-02-10)

### Schema Analysis
```prisma
model Company {
  id                  String              @id @default(uuid())
  userId              String
  name                String
  slug                String              @unique
  plusvibeWorkspaceId  String?             // <- EXISTS but no API key
  ...
}
```

**Missing:** `plusvibeApiKey` field for per-project API keys

### API Routes Analysis

**Current:** All routes use global env vars:
```typescript
// From env.ts
plusvibe: {
  apiKey: () => env("PLUSVIBE_API_KEY"),
  workspaceId: () => env("PLUSVIBE_WORKSPACE_ID"),
}
```

**Files to Update:**
- `app/api/plusvibe/campaigns/route.ts` - GET, POST
- `app/api/plusvibe/campaigns/[id]/route.ts` - PATCH, DELETE
- `app/api/plusvibe/accounts/route.ts` - GET
- `app/api/plusvibe/unibox/route.ts` - GET

### Environment Variables (Current)
```
PLUSVIBE_API_KEY=7332bc56-e2769fd4-9f1a00b6-ebb7ce28
PLUSVIBE_WORKSPACE_ID=678eb62a071ff7544034bcde
```

---

## Implementation Plan

### Phase 1: Schema Update ✅
**File:** `prisma/schema.prisma`

Add to `Company` model:
```prisma
model Company {
  // ... existing fields ...
  plusvibeWorkspaceId String?
  plusvibeApiKey      String?   @db.Text  // Encrypted storage
  plusvibeEnabled     Boolean   @default(false)
  // ...
}
```

**Migration Required:** Yes

---

### Phase 2: API Route Updates

#### 2.1 Create Project-Aware Helper
**New File:** `lib/plusvibe-project.ts`

```typescript
interface PlusVibeCredentials {
  apiKey: string;
  workspaceId: string;
}

export async function getProjectCredentials(
  companyId: string
): Promise<PlusVibeCredentials | null> {
  // 1. Check database for company-specific credentials
  // 2. Fall back to global env vars if not set
  // 3. Return null if neither available
}
```

#### 2.2 Update Campaign Routes

**File:** `app/api/plusvibe/campaigns/route.ts`

Changes needed:
- Accept `companyId` query param or from session
- Use `getProjectCredentials()` instead of envConfig
- Pass credentials to PlusVibe API calls

**File:** `app/api/plusvibe/campaigns/[id]/route.ts`

Same pattern for PATCH/DELETE

#### 2.3 Update Other Routes
- `app/api/plusvibe/accounts/route.ts`
- `app/api/plusvibe/unibox/route.ts`

---

### Phase 3: UI Updates

#### 3.1 Company Settings Page
**New:** Add PlusVibe configuration section

Fields:
- PlusVibe API Key (masked input)
- Workspace ID (text input)
- Test Connection button
- Enable/Disable toggle

#### 3.2 Campaign Selector
**Update:** When creating/viewing campaigns:
- Show company selector if multiple companies
- Filter campaigns by selected company
- Use company's credentials for API calls

#### 3.3 API Hooks
**Update:** `lib/hooks.ts`

```typescript
export function useCampaigns(companyId?: string) {
  return useApiData<{ campaigns: PlusVibeCampaign[] }>(
    companyId ? `/api/plusvibe/campaigns?companyId=${companyId}` : null
  );
}
```

---

### Phase 4: Documentation

#### For Agents:
1. This file (PROJECT_IMPLEMENTATION.md)
2. Updated API documentation
3. Schema migration notes

#### For Users:
1. How to configure PlusVibe per project
2. Migrating from global to project-level

---

## Database Schema (Target)

```prisma
model User {
  id           String        @id @default(uuid())
  email        String        @unique
  name         String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  companies    Company[]     // One-to-many: User has multiple Companies/Projects
  chatSessions ChatSession[]
}

model Company {
  id                  String              @id @default(uuid())
  userId              String
  user                User                @relation(fields: [userId], references: [id])
  name                String
  slug                String              @unique
  industry            String?
  icp                 String?             @db.Text
  painPoints          String[]
  techStack           String[]
  status              String              @default("active")
  
  // PlusVibe Configuration (Per-Project)
  plusvibeWorkspaceId String?             // Workspace ID for this project
  plusvibeApiKey      String?             // API key for this project
  plusvibeEnabled     Boolean             @default(false)
  
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  documents           KnowledgeDocument[]

  @@index([userId])
}
```

---

## API Changes

### Request Format

All PlusVibe API routes now accept optional `companyId` parameter:

```typescript
// GET /api/plusvibe/campaigns?companyId=xxx
// If companyId provided: use company's credentials
// If not provided: fall back to global env vars
```

### Response Format

No changes - same response structure

---

## Security Considerations

1. **API Key Storage:** Store encrypted in database
2. **Access Control:** Only company owner can view/update keys
3. **Logging:** Never log API keys
4. **Transmission:** Always use HTTPS

---

## Migration Strategy

### For Existing Users

1. Keep global env vars as fallback
2. Add UI to migrate to project-level
3. Gradual transition - no breaking changes

### Database Migration

```sql
-- Add new columns
ALTER TABLE "Company" ADD COLUMN "plusvibeApiKey" TEXT;
ALTER TABLE "Company" ADD COLUMN "plusvibeEnabled" BOOLEAN DEFAULT false;
```

---

## Testing Checklist

- [ ] Schema migration runs successfully
- [ ] API routes work with global credentials (backward compat)
- [ ] API routes work with project-specific credentials
- [ ] UI shows correct campaigns per project
- [ ] Settings page saves/loads API keys correctly
- [ ] Error handling when credentials invalid

---

## Progress Log

### 2026-02-10 18:56 - Initial Analysis
- Reviewed current schema
- Identified missing `plusvibeApiKey` field
- Mapped all API routes that need updates
- Found global env var dependency in 4 files

### 2026-02-10 19:00 - Schema Update ✅
- Added `plusvibeApiKey` field to Company model
- Added `plusvibeEnabled` boolean flag
- Schema file updated

### 2026-02-10 19:02 - Helper Function ✅
- Created `lib/plusvibe-project.ts`
- `getProjectCredentials()` - resolves credentials with fallback
- `updateProjectCredentials()` - saves credentials to DB
- `testCredentials()` - validates credentials
- `getPlusVibeHeaders()` - returns headers for API calls

### 2026-02-10 19:04 - API Routes Updated ✅
- `app/api/plusvibe/campaigns/route.ts` - GET, POST updated
- `app/api/plusvibe/campaigns/[id]/route.ts` - PATCH, DELETE updated
- `app/api/plusvibe/accounts/route.ts` - GET updated
- `app/api/plusvibe/unibox/route.ts` - GET updated
- All routes now support `companyId` query param
- Backward compatible with global env vars

### 2026-02-10 19:06 - Documentation ✅
- Created `documents/doom/plusvibe-campaigns.md`
- Updated `lib/hooks.ts` with companyId support

### 2026-02-10 19:10 - UI Components ✅
- Created `CompanySettings.tsx` component
- Added Companies tab to Settings page
- Company list with PlusVibe status indicators
- Edit form with API key configuration
- Test Connection button
- Toggle for enabling/disabling PlusVibe per company
- API key visibility toggle

### 2026-02-10 19:12 - API Updates ✅
- Updated `/api/companies` route with PATCH endpoint
- Support for updating PlusVibe credentials
- Full CRUD for company PlusVibe config

### Next Steps
1. Run Prisma migration
2. Test end-to-end with real credentials
3. Add company selector to Campaigns page

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| `prisma/schema.prisma` | Add apiKey field | ✅ Done |
| `lib/plusvibe-project.ts` | New helper | ✅ Done |
| `app/api/plusvibe/campaigns/route.ts` | Use project credentials | ✅ Done |
| `app/api/plusvibe/campaigns/[id]/route.ts` | Use project credentials | ✅ Done |
| `app/api/plusvibe/accounts/route.ts` | Use project credentials | ✅ Done |
| `app/api/plusvibe/unibox/route.ts` | Use project credentials | ✅ Done |
| `app/settings/page.tsx` | Add PlusVibe config UI | ✅ Done |
| `components/CompanySettings.tsx` | Company PlusVibe UI | ✅ Done |
| `components/Settings.tsx` | Add Companies tab | ✅ Done |
| `app/api/companies/route.ts` | PATCH endpoint for updates | ✅ Done |
| `lib/hooks.ts` | Add companyId param | ✅ Done |

---

## Related Documentation

- `Integrations/GTM_ENGINE.md` - Overall GTM Engine architecture
- `documents/doom/plusvibe-campaigns.md` - PlusVibe campaign docs (create this)
- Supabase credentials: Check `.env` or Supabase dashboard
