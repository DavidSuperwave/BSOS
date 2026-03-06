# Inboxing Slot System Implementation

## Overview

This document describes the slot-based domain management system for Inboxing API integration. The system ensures that:

1. **Admin** has full access to all Inboxing domains via platform API key
2. **Users** can only access domains assigned to their company (slot-protected)
3. **Agents** route through protected API routes that verify slot access
4. **CSV downloads** are protected to prevent data leakage

## Architecture

### Database Schema

#### `inboxing_slot_allocations`
Tracks slot allocations per company:
- `total_slots`: Total slots allocated to company
- `used_slots`: Currently used slots (auto-updated via trigger)
- `free_slots`: Computed as `total_slots - used_slots`
- `allocation_type`: `free`, `purchased`, or `trial`
- `stripe_subscription_id`: For purchased slots (future)

#### `inboxing_domain_assignments`
Links Inboxing domains to companies:
- `company_id`: Company that owns the domain
- `inboxing_id`: Inboxing.com domain ID
- `domain_name`: Domain name
- `status`: `active`, `reclaimed`, or `suspended`
- Auto-updates `used_slots` via database trigger

### API Routes

#### Admin Routes (Full Access)

**`GET /api/admin/inboxing-domains`**
- Fetches ALL domains from Inboxing API using platform key
- Enriches with assignment info from database
- Admin only

**`POST /api/admin/inboxing-domains`**
- Assigns domain(s) to a company
- Creates/updates assignment records
- Updates slot counts automatically

**`GET /api/admin/users/search`**
- Searches users by email/name
- Returns company info for assignment

#### Protected Routes (Slot-Checked)

**`GET /api/inboxing/protected/domains`**
- Returns only domains assigned to the company
- Filters Inboxing API results by assignment records

**`POST /api/inboxing/protected/domains`**
- Creates new domain via Inboxing API
- Checks available slots before creation
- Creates assignment record and increments used slots

**`GET /api/inboxing/protected/domains/[id]/csv`**
- Downloads CSV for a domain
- Verifies domain belongs to company before allowing download

### Admin Dashboard

**`/admin/inboxing-domains`**
- Lists all domains from Inboxing API
- Shows assignment status
- Allows assigning domains to companies via user search
- CSV download buttons (when available)

## Slot Management

### Initialization
- Companies start with 0 slots
- Admin can allocate free slots via `allocateSlots()`
- Future: Stripe integration for purchased slots

### Assignment Flow
1. Admin assigns domain to company via admin dashboard
2. Assignment record created in `inboxing_domain_assignments`
3. Database trigger increments `used_slots` for company
4. Domain becomes accessible via protected routes

### Reclamation Flow
1. Admin reclaims domain (sets status to `reclaimed`)
2. Database trigger decrements `used_slots` for company
3. Domain no longer accessible via protected routes

## Security Features

### 1. Slot Verification
- All protected routes check slot availability before operations
- Users cannot create domains without available slots
- Returns clear error: "No available slots"

### 2. Domain Access Control
- Protected routes verify domain belongs to company
- CSV downloads require domain ownership verification
- Prevents cross-company data access

### 3. API Key Protection
- Platform key (`INBOXING_API_KEY`) only used by admin routes
- Users never have direct access to Inboxing API
- All operations go through protected routes

### 4. Agent Routing
- Agents must use `/api/inboxing/protected/*` routes
- Cannot bypass slot checks
- Cannot access other companies' domains

## Usage Examples

### Admin: Assign Domain to Company
```typescript
POST /api/admin/inboxing-domains
{
  "inboxing_ids": ["inboxing_domain_id_123"],
  "company_id": "company_uuid",
  "notes": "Assigned for campaign"
}
```

### User: List Assigned Domains
```typescript
GET /api/inboxing/protected/domains?companyId=company_uuid
// Returns only domains assigned to this company
```

### User: Create Domain (with slot check)
```typescript
POST /api/inboxing/protected/domains
{
  "company_id": "company_uuid",
  "domain": "example.com",
  "names": [{ "first_name": "John", "last_name": "Doe" }],
  "user_count": 49
}
// Automatically checks slots and creates assignment
```

### User: Download CSV
```typescript
GET /api/inboxing/protected/domains/inboxing_id_123/csv?companyId=company_uuid
// Verifies domain belongs to company before allowing download
```

## Future Enhancements

1. **Stripe Integration**
   - Auto-allocate slots on subscription purchase
   - Track slot purchases in `inboxing_slot_allocations`
   - Handle subscription cancellations

2. **Slot Expiration**
   - Free/trial slots expire after set period
   - Auto-reclaim domains when slots expire
   - Notify users before expiration

3. **Bulk Operations**
   - Bulk assign multiple domains
   - Bulk reclaim domains
   - Slot usage analytics

4. **Agent Integration**
   - Update agent tools to use protected routes
   - Add slot checking to domain creation tools
   - Prevent agent from bypassing slot system

## Migration

Run the migration to create slot tracking tables:
```bash
# Migration file: ui/supabase/migrations/20260306_inboxing_slot_system.sql
```

The migration:
- Creates `inboxing_slot_allocations` table
- Creates `inboxing_domain_assignments` table
- Sets up RLS policies
- Creates triggers for auto-updating slot counts
- Initializes slot allocations for existing companies (0 slots)

## Testing

### Admin Flow
1. Login as admin
2. Navigate to `/admin/inboxing-domains`
3. View all domains from Inboxing API
4. Search for user and assign domain
5. Verify assignment appears in database

### User Flow
1. Login as user
2. Call `GET /api/inboxing/protected/domains?companyId=...`
3. Verify only assigned domains are returned
4. Try to create domain (should check slots)
5. Try to download CSV (should verify ownership)

### Security Testing
1. User A tries to access User B's domain CSV → Should fail
2. User tries to create domain without slots → Should fail with clear error
3. Agent tries to bypass protected routes → Should not have access
