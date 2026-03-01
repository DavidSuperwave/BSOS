# Dashboard Route Tracker
## UI Components Status

**Route:** `/dashboard`  
**Main File:** `src/app/dashboard/page.tsx`  
**Created:** 2026-02-26

---

## ✅ Completed Components

### 1. Stats Grid (4 cards)
**File:** `src/app/dashboard/page.tsx`  
**Status:** ✅ Working with real data

| Metric | Data Source | Status |
|--------|-------------|--------|
| Total Leads | `data.plusvibeStats.totalLeads` | ✅ Live |
| Contacted | `data.plusvibeStats.contacted` | ✅ Live |
| Replied | `data.plusvibeStats.replied` | ✅ Live |
| Positive | `data.plusvibeStats.positive` | ✅ Live |

**Notes:** Uses `useDashboardMetrics` hook. Trends calculated from rates.

---

### 2. Events / Action Items Card
**File:** `src/components/dashboard/events-card.tsx`  
**Status:** ✅ Working

Features:
- ✅ Event list with icons (action_item, insight, alert, status_update, cron_result)
- ✅ Priority badges (urgent, high, medium, low)
- ✅ Unread count badge
- ✅ Dismiss/Mark read actions
- ✅ Action buttons (navigate, view issue)
- ✅ Skill issue modal popup

**Data:** `useEvents` context

---

### 3. Latest Update Card
**File:** `src/components/dashboard/latest-update-card.tsx`  
**Status:** ✅ Working

Features:
- ✅ Range tabs (Today / Yesterday / This week)
- ✅ Sort dropdown (Newest/Oldest)
- ✅ Search filter
- ✅ Activity icons by type (email_reply, meeting_booked, opportunity_created)
- ✅ Timestamp formatting

**Data:** `useDashboardActivities` hook

---

### 4. SLA Monitoring Table
**File:** `src/components/dashboard/sla-monitoring-table.tsx`  
**Status:** 🟡 Partial - Needs Real Data

| Column | Data | Status |
|--------|------|--------|
| Campaign ID | `campaign.id` | ✅ |
| Campaign Name | `campaign.name` | ✅ |
| Status | `campaign.status` | ✅ |
| Last Sent | `campaign.lastSent` | ✅ |
| Last Reply | `campaign.lastReplied` | ✅ |
| **SLA Due** | **Hardcoded `-`** | ❌ **NEEDS WIRING** |
| **Priority** | **Hardcoded `-`** | ❌ **NEEDS WIRING** |
| Actions | More button (no handler) | 🟡 Placeholder |

**Needs:**
- SLA calculation logic (time since last reply vs SLA target)
- Priority field from campaign data
- Actions dropdown menu

---

## ❌ Pending / Mock Data

### 5. Daily Send Chart
**File:** `src/components/dashboard/daily-send-chart.tsx`  
**Status:** ❌ MOCK DATA

```typescript
// CURRENT - Mock data hardcoded
const MOCK_DAILY_SEND_DATA = [
  { day: "Sun", sent: 96 },
  { day: "Mon", sent: 132 },
  // ... etc
];
```

**Needs:**
- Real daily send volume from PlusVibe API
- 7-day rolling window
- Aggregate by day of week

**API Needed:**
```typescript
// Suggested hook addition
const { data: dailySendData } = useDailySendVolume(companyId, days = 7);
```

---

## 🎨 UI Polish Pending

### General
- [ ] Loading skeletons for all cards (partial - only main page has skeleton)
- [ ] Empty states styling review
- [ ] Mobile responsive check for SLA table (horizontal scroll works but cramped)

### Stats Cards
- [ ] Add click-to-drill-down behavior?
- [ ] Sparkline mini-charts for trends?

### Events Card
- [ ] Infinite scroll or pagination for many events
- [ ] Event type filters?

### Daily Send Chart
- [ ] Time range selector (7d / 30d / 90d)?
- [ ] Compare to previous period?

---

## 🔌 API / Data Pending

| Feature | Endpoint Status | UI Status |
|---------|-----------------|-----------|
| Daily send volume | ❌ Not built | ❌ Mock data |
| SLA calculation | ❌ Not built | ❌ Shows "-" |
| Campaign priority | 🟡 Field exists? | ❌ Not wired |
| Campaign actions | N/A | 🟡 Button placeholder |

---

## 🐛 Known Issues

1. **Daily Send Chart shows mock data**
   - Risk: Users see fake numbers
   - Fix: Build daily volume API endpoint

2. **SLA Monitoring shows "-" for SLA Due and Priority**
   - Risk: Table looks broken
   - Fix: Either hide columns or wire real data

3. **Campaign actions button does nothing**
   - Risk: UX dead end
   - Fix: Add dropdown with View/Edit/Pause actions

---

## 📝 Notes for Cursor Collaboration

**When fixing UI components:**

1. **DailySendChart** - Replace `MOCK_DAILY_SEND_DATA` with real data fetch
   - Check if `useDashboardMetrics` already has this data
   - If not, add to API or create new hook

2. **SLAMonitoringTable** - Either:
   - Option A: Hide "SLA Due" and "Priority" columns until data available
   - Option B: Wire calculation logic (SLA = lastReply + 24h or similar)

3. **General** - Keep styling consistent:
   - Cards use `Card`, `CardHeader`, `CardContent` from ui/card
   - Colors use CSS vars: `hsl(var(--primary))`, etc.
   - Icons from lucide-react

---

## ✅ Sign-Off Checklist

Before dashboard is "done":
- [ ] Daily Send Chart shows real data
- [ ] SLA Monitoring shows real SLA/priority (or hide columns)
- [ ] Campaign actions button works
- [ ] All loading states handled
- [ ] Mobile responsive verified
- [ ] No console errors

---

*Last Updated: 2026-02-26*
