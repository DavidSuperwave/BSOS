# Inboxing Domains Admin Setup

## Overview

The admin dashboard now fetches **ALL existing domains** from your Inboxing API account and allows you to assign them to companies. This uses your platform API key from the `INBOXING_API_KEY` environment variable.

## What's Been Set Up

### 1. Admin Page: `/admin/inboxing-domains`
- Lists all domains from Inboxing API
- Shows domain name, status, mailboxes, redirect URL
- Shows assignment status (which company owns it)
- CSV download buttons
- User search for assignment

### 2. Slot System
- Tracks total slots, used slots, available slots
- Shows slot information in the stats dashboard
- Automatically updates when domains are assigned

### 3. Assignment System
- Assign domains to companies via user search
- Tracks assignments in `inboxing_domain_assignments` table
- Updates slot counts automatically

## How to Use

### Step 1: Verify Environment Variable

Make sure `INBOXING_API_KEY` is set in your environment:

```bash
# Check if it's set
echo $INBOXING_API_KEY

# Should show your Inboxing API key
```

If not set, add it to your `.env` or `.env.local`:
```
INBOXING_API_KEY=your_inboxing_api_key_here
```

### Step 2: Access the Page

1. Login as admin at `/admin-login`
2. Navigate to **"Inboxing Domains"** in the sidebar
3. You should see all your existing domains from Inboxing

### Step 3: View Domain Details

Each domain shows:
- **Domain Name**: The actual domain (e.g., example.com)
- **Status**: active, pending, setting_up, etc.
- **Mailboxes**: Current count / Total capacity
- **Redirect**: The redirect URL if configured
- **Assigned To**: Company name if assigned, or "Unassigned"
- **CSV**: Download button (if available after 24-hour warmup)

### Step 4: Assign Domain to Company

1. Click **"Assign"** button on any domain
2. Search for user (e.g., type user's email or name)
3. Select the user from results
4. Click **"Assign Domain"**

The domain will be:
- Linked to the company in `inboxing_domain_assignments`
- Slot count incremented for that company
- Accessible via protected routes for that company

## API Endpoints

### GET `/api/admin/inboxing-domains`
Fetches all domains from Inboxing API (uses platform key)

**Query Parameters:**
- `page` - Page number (default: 1)
- `per_page` - Items per page (default: 50)
- `status` - Filter by status (optional)
- `search` - Search domain names (optional)

**Response:**
```json
{
  "domains": [
    {
      "id": "inboxing_domain_id",
      "domain": "example.com",
      "status": "active",
      "mailbox_count": 49,
      "user_count": 49,
      "redirect_url": "https://example.com",
      "redirect_type": "REGULAR",
      "csv_available_at": "2026-03-06T...",
      "assigned_to_company_id": "uuid",
      "assigned_to_company_name": "Company Name",
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 100,
    "total_pages": 2
  }
}
```

### POST `/api/admin/inboxing-domains`
Assign domain(s) to a company

**Body:**
```json
{
  "inboxing_ids": ["domain_id_1", "domain_id_2"],
  "company_id": "company_uuid",
  "notes": "Optional notes"
}
```

### GET `/api/admin/inboxing-slots`
Get slot information from Inboxing API

**Response:**
```json
{
  "slots": {
    "total": 100,
    "used": 45,
    "available": 55
  }
}
```

## Troubleshooting

### No domains showing?

1. **Check API Key**: Verify `INBOXING_API_KEY` is set correctly
2. **Check API Response**: Open browser DevTools → Network tab → Check `/api/admin/inboxing-domains` response
3. **Check Console**: Look for errors in browser console
4. **Check Server Logs**: Check Next.js server logs for API errors

### "Failed to fetch domains" error?

- Verify the API key has access to domains
- Check if Inboxing API is accessible
- Verify the key format is correct (should start with `inb_live_`)

### Domains not assigning?

- Verify company_id exists in database
- Check `inboxing_domain_assignments` table exists
- Verify slot allocation exists for company
- Check browser console for errors

### Slot count not updating?

- Verify migration `inboxing_slot_system` was applied
- Check `inboxing_slot_allocations` table exists
- Verify triggers are working (check database logs)

## Database Tables

- `inboxing_domain_assignments` - Links Inboxing domains to companies
- `inboxing_slot_allocations` - Tracks slot allocations per company
- `domain_inventory` - Admin-managed domain pool (separate system)

## Next Steps

1. **Test the page**: Go to `/admin/inboxing-domains` and verify domains load
2. **Assign a test domain**: Assign one domain to a test company
3. **Verify slots**: Check that slot count updates correctly
4. **Test protected routes**: Verify user can only see assigned domains

## Current Slot Allocation

- **blitzscale** company: 5 free slots allocated
- Ready for testing domain assignments
