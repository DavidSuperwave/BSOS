# Data Quality Workflows for GTM Engine
## Implementation Plan Based on Landbase Article

---

## 1. STALE CONTACT DETECTION & MANAGEMENT

### The Problem
- 30% of employees change jobs annually
- 25-30% B2B contact data decays per year
- Outdated emails = bounce rates = sender reputation damage

### GTM Engine Implementation

#### A. Job Change Monitoring Agent
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ JOB CHANGE DETECTION WORKFLOW                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TRIGGER: Weekly cron job (Sundays at 2 AM)                                 │
│                                                                             │
│  STEPS:                                                                     │
│  1. Query all contacts with LinkedIn URLs in last campaign                  │
│  2. For each contact:                                                       │
│     - Scrape LinkedIn profile (current title, company)                      │
│     - Compare with stored CRM data                                          │
│     - Calculate similarity score                                            │
│                                                                             │
│  3. If mismatch detected (>70% different):                                  │
│     - Flag contact as "STALE - Job Change"                                  │
│     - Create task in Close CRM for rep to verify                            │
│     - Add to "Re-engagement Queue" with new company research                │
│     - Send Telegram alert to admin                                          │
│                                                                             │
│  4. Auto-enrich new company data via Perplexity:                            │
│     - New company industry, size, tech stack                                │
│     - Decision-makers at new company                                        │
│     - Updated ICP fit score                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Code Location:** `automation/gtm-engine/agents/job-change-monitor.js`

**APIs Needed:**
- LinkedIn scraping (Hyperbrowser or Proxycurl)
- Perplexity for company research
- Close CRM for task creation
- Telegram for alerts

---

#### B. Email Verification Pipeline
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EMAIL VERIFICATION WORKFLOW                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TRIGGER: Before every campaign launch                                      │
│                                                                             │
│  STEPS:                                                                     │
│  1. Extract all email addresses from campaign lead list                     │
│  2. Batch verify via ZeroBounce/Emailable API                               │
│                                                                             │
│  3. For each result:                                                        │
│     VALID     → Proceed with campaign                                       │
│     CATCH_ALL → Flag for manual review                                      │
│     INVALID   → Remove from campaign, mark in CRM                           │
│     UNKNOWN   → Retry in 24 hours, flag if still unknown                    │
│                                                                             │
│  4. Generate verification report:                                           │
│     - Total emails checked                                                  │
│     - Valid % / Invalid % / Unknown %                                       │
│     - Estimated bounce rate prevention                                      │
│     - Cost savings (undelivered emails avoided)                             │
│                                                                             │
│  5. Auto-update Close CRM with verification status                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Code Location:** `automation/gtm-engine/agents/email-verifier.js`

**Integration:** Run automatically before `campaign-creator.js` launches

---

## 2. COMPANY MATCH VALIDATION

### The Problem
- 94% of businesses suspect inaccurate customer data
- Wrong company = wrong account owner = lost deals
- Duplicate accounts create confusion and conflict

### GTM Engine Implementation

#### A. Company Domain Validation
```typescript
// Company Validation Middleware
// Location: automation/gtm-engine/lib/company-validator.ts

interface CompanyValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

async function validateCompanyMatch(
  contactEmail: string,
  companyName: string,
  companyDomain?: string
): Promise<CompanyValidationResult> {
  
  const emailDomain = contactEmail.split('@')[1];
  const issues: string[] = [];
  
  // Check 1: Email domain matches company domain
  if (companyDomain && emailDomain !== companyDomain) {
    issues.push(`Email domain (${emailDomain}) doesn't match company domain (${companyDomain})`);
  }
  
  // Check 2: Company name normalization
  const normalizedName = normalizeCompanyName(companyName);
  const existingCompanies = await searchCompaniesByDomain(emailDomain);
  
  if (existingCompanies.length > 0) {
    const match = findBestMatch(normalizedName, existingCompanies);
    if (match.similarity < 0.8) {
      issues.push(`Company name mismatch. Did you mean: ${match.name}?`);
    }
  }
  
  // Check 3: Enrich missing firmographics
  if (!companyDomain) {
    const enriched = await enrichCompanyByName(companyName);
    if (enriched.domain) {
      issues.push(`Missing company domain. Suggested: ${enriched.domain}`);
    }
  }
  
  return {
    isValid: issues.length === 0,
    confidence: issues.length === 0 ? 1.0 : 0.5,
    issues,
    suggestions: generateSuggestions(issues)
  };
}
```

#### B. Lead Routing Intelligence
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SMART LEAD ROUTING WORKFLOW                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TRIGGER: New lead created in Close CRM                                     │
│                                                                             │
│  STEPS:                                                                     │
│  1. Extract lead data (email, company, title)                               │
│  2. Validate company match (see above)                                      │
│                                                                             │
│  3. If validation fails:                                                    │
│     - Create "Data Quality Alert" task for RevOps                           │
│     - Pause lead routing until resolved                                     │
│     - Send Slack notification                                               │
│                                                                             │
│  4. If validation passes:                                                   │
│     - Check if company exists in Close CRM                                  │
│     - If YES: Route to existing account owner                               │
│     - If NO: Create new account + route via round-robin                     │
│                                                                             │
│  5. Enrich account with:                                                    │
│     - Firmographics (industry, size, revenue)                               │
│     - Technographics (tech stack signals)                                   │
│     - Recent news (funding, hires, expansions)                              │
│     - ICP fit score (1-100)                                                 │
│                                                                             │
│  6. Update lead score based on enrichment quality                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Code Location:** `automation/gtm-engine/agents/lead-router.js`

---

## 3. ENRICHMENT FAILURE DETECTION

### The Problem
- 91% of CRM data is incomplete
- Missing fields = poor personalization = low conversion
- Lead scoring depends on complete data

### GTM Engine Implementation

#### A. Data Completeness Monitor
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DATA COMPLETENESS DASHBOARD                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DAILY REPORT (Sent to RevOps Slack):                                       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ COMPANY DATA HEALTH                                                   │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │ Superwave Contacts:                                                   │ │
│  │   Total: 1,247  |  Complete: 68%  |  Enrichment Needed: 399           │ │
│  │                                                                       │ │
│  │ Missing Fields Breakdown:                                             │ │
│  │   ❌ Phone: 234 contacts     [Enrich Now]                             │ │
│  │   ❌ Title: 189 contacts     [Enrich Now]                             │ │
│  │   ❌ Industry: 445 accounts  [Enrich Now]                             │ │
│  │   ❌ LinkedIn: 312 contacts  [Enrich Now]                             │ │
│  │                                                                       │ │
│  │ High-Priority Enrichment (Hot Leads Missing Data):                    │ │
│  │   • John Smith (ACME Corp) - Score: 85, Missing: Phone               │ │
│  │   • Sarah Chen (TechFlow) - Score: 78, Missing: Title                │ │
│  │                                                                       │ │
│  │ [View Full Report]  [Run Enrichment]  [Export CSV]                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### B. Multi-Source Enrichment Cascade
```typescript
// Enrichment Cascade Engine
// Location: automation/gtm-engine/lib/enrichment-cascade.ts

interface EnrichmentSource {
  name: string;
  priority: number;
  fields: string[];
  api: (contact: Contact) => Promise<Partial<Contact>>;
}

const ENRICHMENT_SOURCES: EnrichmentSource[] = [
  {
    name: 'Clearbit',
    priority: 1,
    fields: ['title', 'company', 'industry', 'location'],
    api: enrichWithClearbit
  },
  {
    name: 'Proxycurl (LinkedIn)',
    priority: 2,
    fields: ['title', 'company', 'linkedin_url', 'skills'],
    api: enrichWithProxycurl
  },
  {
    name: 'Perplexity AI',
    priority: 3,
    fields: ['company_description', 'recent_news', 'icp_signals'],
    api: enrichWithPerplexity
  },
  {
    name: 'Apollo',
    priority: 4,
    fields: ['phone', 'email_verified', 'company_size'],
    api: enrichWithApollo
  }
];

async function cascadeEnrichment(contact: Contact): Promise<Contact> {
  const enriched = { ...contact };
  const missingFields = getMissingFields(contact);
  
  for (const source of ENRICHMENT_SOURCES.sort((a, b) => a.priority - b.priority)) {
    // Check if this source can fill any missing fields
    const fillableFields = source.fields.filter(f => missingFields.includes(f));
    
    if (fillableFields.length > 0) {
      try {
        const result = await source.api(contact);
        
        // Merge only the missing fields
        for (const field of fillableFields) {
          if (result[field] && !enriched[field]) {
            enriched[field] = result[field];
            missingFields.splice(missingFields.indexOf(field), 1);
          }
        }
        
        // Log enrichment success
        await logEnrichment(contact.id, source.name, fillableFields);
        
      } catch (error) {
        await logEnrichmentFailure(contact.id, source.name, error);
      }
    }
    
    // Stop if all fields are filled
    if (missingFields.length === 0) break;
  }
  
  return enriched;
}
```

**Code Location:** `automation/gtm-engine/lib/enrichment-cascade.ts`

---

## 4. DUPLICATE DETECTION & MERGING

### The Problem
- 15-30% of B2B databases are duplicates
- 550 hours/year lost per rep dealing with bad data
- Double-work, over-contact, inflated metrics

### GTM Engine Implementation

#### A. Fuzzy Duplicate Detection
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DUPLICATE DETECTION ENGINE                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MATCHING RULES (Configurable):                                             │
│                                                                             │
│  EXACT MATCH (High Confidence):                                             │
│    • Same email address                                                     │
│    • Same phone number                                                      │
│    • Same LinkedIn URL                                                      │
│                                                                             │
│  FUZZY MATCH (Medium Confidence):                                           │
│    • Name similarity > 90% + Same company domain                            │
│    • Name similarity > 85% + Same phone                                     │
│    • Email local-part match + Same company                                  │
│                                                                             │
│  POTENTIAL MATCH (Low Confidence - Flag for Review):                        │
│    • Name similarity > 80% + Similar company name                           │
│    • Same title + Same company + Similar name                               │
│                                                                             │
│  AUTOMATED ACTIONS:                                                         │
│  • Exact matches → Auto-merge (configurable)                                │
│  • Fuzzy matches → Create merge suggestion task                             │
│  • Potential matches → Add to review queue                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### B. Merge Suggestion UI (Admin Dashboard)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DUPLICATE REVIEW QUEUE                                      [Merge All] [X] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 🔴 HIGH CONFIDENCE (Auto-merge available)                             │  │
│  │                                                                       │  │
│  │ Record A: john.smith@acme.com | VP Sales | ACME Corp                  │  │
│  │ Record B: john.smith@acme.com | VP Sales | ACME Corporation           │  │
│  │ Match: 99% (Same email)                                               │  │
│  │                                                                       │  │
│  │ [Preview Merge] [Merge Now] [Ignore]                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 🟡 MEDIUM CONFIDENCE (Requires Review)                                │  │
│  │                                                                       │  │
│  │ Record A: sarah.chen@techflow.io | Marketing Director | TechFlow      │  │
│  │ Record B: s.chen@techflow.io | Director of Marketing | TechFlow Inc   │  │
│  │ Match: 87% (Name similarity + domain match)                           │  │
│  │                                                                       │  │
│  │ [Compare Details] [Merge] [Not a Duplicate]                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Code Location:** `automation/gtm-engine/agents/duplicate-detector.js`

---

## 5. DATA QUALITY SCORING

### Implementation: Lead Quality Score
```typescript
// Data Quality Score Calculator
// Location: automation/gtm-engine/lib/data-quality-scorer.ts

interface DataQualityScore {
  overall: number; // 0-100
  breakdown: {
    completeness: number;
    accuracy: number;
    freshness: number;
    uniqueness: number;
  };
  issues: string[];
  recommendations: string[];
}

function calculateDataQualityScore(contact: Contact): DataQualityScore {
  const breakdown = {
    completeness: calculateCompleteness(contact),
    accuracy: calculateAccuracy(contact),
    freshness: calculateFreshness(contact),
    uniqueness: calculateUniqueness(contact)
  };
  
  const overall = Math.round(
    (breakdown.completeness * 0.4) +
    (breakdown.accuracy * 0.3) +
    (breakdown.freshness * 0.2) +
    (breakdown.uniqueness * 0.1)
  );
  
  return {
    overall,
    breakdown,
    issues: identifyIssues(contact, breakdown),
    recommendations: generateRecommendations(contact, breakdown)
  };
}

// Completeness: % of required fields filled
// Accuracy: Email validity, company match confidence
// Freshness: Last enrichment date, job change flags
// Uniqueness: Duplicate detection score
```

---

## 6. INTEGRATION WITH EXISTING GTM ENGINE

### New Cron Jobs to Add

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `job-change-monitor.js` | Weekly | Detect job changes via LinkedIn |
| `email-verification.js` | Pre-campaign | Verify emails before send |
| `data-completeness-report.js` | Daily | Report on missing fields |
| `duplicate-scanner.js` | Weekly | Find and flag duplicates |
| `enrichment-cascade.js` | On-demand | Fill missing fields via multi-source |

### Database Additions

```sql
-- Data quality tracking
CREATE TABLE data_quality_scores (
  contact_id VARCHAR(255) PRIMARY KEY,
  overall_score INTEGER,
  completeness_score INTEGER,
  accuracy_score INTEGER,
  freshness_score INTEGER,
  uniqueness_score INTEGER,
  issues JSONB,
  last_calculated TIMESTAMPTZ DEFAULT NOW()
);

-- Enrichment history
CREATE TABLE enrichment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id VARCHAR(255),
  source VARCHAR(100),
  fields_filled JSONB,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Duplicate detection log
CREATE TABLE duplicate_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_a_id VARCHAR(255),
  record_b_id VARCHAR(255),
  match_score DECIMAL(5,2),
  match_type VARCHAR(50),
  status VARCHAR(50), -- pending, merged, ignored
  merged_by UUID,
  merged_at TIMESTAMPTZ
);
```

---

## 7. DASHBOARD WIDGETS

### Data Quality Overview Card
```
┌─────────────────────────────────────────────────────────────┐
│ DATA QUALITY HEALTH                              [Details]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Overall Score: 78/100                    [████████░░░░]   │
│                                                             │
│  Completeness  ████████░░  82%  (234 contacts need data)   │
│  Accuracy      █████████░  90%  (45 validation issues)     │
│  Freshness     ██████░░░░  65%  (412 contacts >6mo old)    │
│  Uniqueness    ██████████  95%  (23 duplicates found)      │
│                                                             │
│  🔴 Critical: 12 contacts with invalid emails              │
│  🟡 Warning: 89 contacts missing phone numbers             │
│                                                             │
│  [Run Data Cleanup]  [View Report]  [Export Issues]        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

1. **Week 1:** Email verification pipeline (highest ROI)
2. **Week 2:** Data completeness monitoring + daily reports
3. **Week 3:** Duplicate detection engine
4. **Week 4:** Job change monitoring + LinkedIn integration
5. **Week 5:** Multi-source enrichment cascade
6. **Week 6:** Dashboard widgets + scoring

---

Ready to start implementing? Which workflow first?
