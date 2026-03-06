# Research Workflow Implementation

## Overview

This document describes the research workflow feature that allows users to research target markets, generate email scripts, and create campaigns directly from the chat agent.

## Features Implemented

### 1. Research and Campaign Creation Tool (`research_and_create_campaign`)

**Location:** `ui/src/lib/agent-tools.ts`

**Functionality:**
- Researches a target market/industry based on company profile
- Generates 3 email scripts tailored to the research findings
- Stores research and actions in Supermemory
- Returns campaign creation options

**Parameters:**
- `companyId` (required): Company ID for scoped access
- `researchTopic` (required): Topic to research (e.g., "Marketing agencies", "SaaS companies")
- `senderEmail` (required): Email address to use as sender (e.g., "David@superwave.ai")

**Workflow:**
1. Fetches company profile from Supabase
2. Builds research query with company context
3. Researches topic using Perplexity AI
4. Generates 3 email scripts using AI based on research
5. Stores research summary and scripts in Supermemory
6. Returns results with campaign creation instructions

### 2. Campaign Creation Tool (`create_campaign`)

**Location:** `ui/src/lib/agent-tools.ts`

**Functionality:**
- Creates a new campaign in PlusVibe
- Adds email sequences to the campaign
- Supports multiple email scripts with wait times

**Parameters:**
- `companyId` (required): Company ID for scoped access
- `campaignName` (required): Campaign name
- `emailScripts` (required): Array of email scripts with subject, body, and metadata
- `senderEmail` (required): Sender email address

**Email Script Structure:**
```typescript
{
  name: string;        // Script name/angle
  subject: string;     // Email subject line
  body: string;        // Email body HTML
  angle: string;       // Pain point angle
  framework: string;   // Framework identifier (F1-F6)
}
```

### 3. Tool Registration

**Location:** `ui/src/lib/chat/tool-gateway.ts`

Both tools are registered and available for:
- `main` agent type
- `campaigns` agent type
- `research` agent type

## Usage Example

### Step 1: Research and Generate Scripts

```
User: Research "Marketing agencies" and generate email scripts. Use David@superwave.ai as the sender.

Agent: [Calls research_and_create_campaign tool]
- Researches marketing agencies
- Generates 3 email scripts
- Stores in Supermemory
- Returns results with campaign creation option
```

### Step 2: Create Campaign

```
User: Create a campaign called "Marketing Agencies Q1 2025" using the first script.

Agent: [Calls create_campaign tool]
- Creates campaign in PlusVibe
- Adds email sequences
- Returns campaign ID and confirmation
```

## Supermemory Integration

Research summaries are stored in Supermemory with:
- **Category:** `research_summary`
- **Container Tag:** `gtm_{company_slug}`
- **Metadata:**
  - `research_topic`: The researched topic
  - `company_id`: Company ID
  - `sender_email`: Sender email address
  - `scripts_count`: Number of scripts generated
  - `created_at`: Timestamp

**Content Format:**
```markdown
# Research: {topic}

## Research Findings
{research content}

## Citations
{citations}

## Email Scripts Generated
{scripts with subjects and bodies}

## Actions Taken
- Research completed on {timestamp}
- 3 email scripts generated
- Ready for campaign creation
- Sender: {email}
```

## Email Script Generation

The system generates 3 email scripts with different angles:

1. **Infrastructure Pain Angle** (F1 Framework)
   - Focuses on email deliverability issues
   - Best for: Marketing agencies, brokerages

2. **Data Quality Angle** (F2 Framework)
   - Focuses on lead data quality
   - Best for: B2B SaaS, companies with data issues

3. **Scale Without Hiring Angle** (F3 Framework)
   - Focuses on automation and scaling
   - Best for: Mid-market SaaS, companies wanting to scale

Each script:
- Is under 75 words
- Includes personalization placeholders (`{{firstName}}`, `{{company}}`)
- Has a clear CTA
- Uses casual, direct tone

## Testing

To test with David@superwave.ai:

1. Open chat interface
2. Select company (must have PlusVibe and Perplexity credentials configured)
3. Send message: "Research 'Marketing agencies' based on my company profile and generate 3 email scripts. Use David@superwave.ai as the sender."
4. Review research results and email scripts
5. Create campaign: "Create a campaign called 'Marketing Agencies Test' using all 3 scripts"
6. Verify campaign created in PlusVibe
7. Check Supermemory for stored research

## Files Modified

1. `ui/src/lib/agent-tools.ts`
   - Added `research_and_create_campaign` tool
   - Added `create_campaign` tool
   - Added helper functions for email script parsing

2. `ui/src/lib/chat/tool-gateway.ts`
   - Registered new tools in tool policies
   - Made tools available to main, campaigns, and research agent types

## Dependencies

- Perplexity API (for research)
- PlusVibe API (for campaign creation)
- Supermemory API (for storing research)
- Supabase (for company profile data)

## Next Steps

1. Test the workflow end-to-end
2. Create video artifact demonstrating the workflow
3. Add error handling for edge cases
4. Add validation for email script format
5. Consider adding A/B testing options for scripts
