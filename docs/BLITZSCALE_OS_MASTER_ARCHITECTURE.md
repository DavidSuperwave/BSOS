# Blitzscale OS: GTM Engine Architecture
## Master System Specification

**Version:** 1.0  
**Date:** February 25, 2026  
**Author:** Julian (AI Head of Operations)  
**For:** Research Paper & Visual Framework Development  

---

## ABSTRACT

Blitzscale OS is a multi-tenant AI-powered Go-To-Market (GTM) operating system that transforms scattered sales operations into a cohesive, intelligent engine. Unlike traditional CRMs that passively store data, Blitzscale OS actively evaluates campaigns, maintains institutional knowledge, and orchestrates multi-agent AI systems to execute GTM workflows autonomously.

The system is built on three architectural pillars:
1. **Chess Engine Evaluation** — Quantitative campaign scoring using game theory principles
2. **Tag-Based Knowledge Graph** — Structured, queryable institutional memory
3. **Multi-Agent Orchestration** — Isolated AI agents with specialized roles

---

## 1. SYSTEM OVERVIEW

### 1.1 The Problem

Traditional GTM operations suffer from:
- **Fragmented knowledge** — Insights scattered across emails, docs, CRMs, and Slack
- **Intuition-based decisions** — "This feels like a good campaign" vs calculated evaluation
- **Single-threaded execution** — One person context-switching between research, writing, and analysis
- **No institutional memory** — Learnings lost when people leave or campaigns end
- **Reactive operations** — Respond to metrics after the fact, not predictive optimization

### 1.2 The Solution

Blitzscale OS introduces **computational GTM** — treating sales operations as an optimization problem with:
- **Position evaluation** (like chess engines assess board states)
- **Knowledge persistence** (Supermemory-backed institutional memory)
- **Parallel agent execution** (specialized AI for each function)
- **Feedback loops** (continuous learning from results)

### 1.3 Core Metaphor: The Chess Engine

Chess engines evaluate millions of positions to find optimal moves. GTM is the same game:
- Limited resources (budget, time, reputation)
- Perfect information (if you know where to look)
- Clear win condition (revenue)
- Position matters (market timing, ICP fit)

**Key insight:** Most GTM teams play by intuition. We play by calculation.

---

## 2. ARCHITECTURAL PILLARS

### 2.1 PILLAR 1: Chess Engine Evaluation

#### 2.1.1 The Analogy

| CHESS CONCEPT | GTM EQUIVALENT | MEASUREMENT |
|---------------|----------------|-------------|
| **Material** | Campaign assets | Lead quality, email performance, offer strength |
| **Position** | Market context | ICP fit, timing, competitive landscape |
| **Mobility** | Operational reach | Deliverability, channel health, list size |
| **King Safety** | Brand protection | Domain health, spam scores, reputation |
| **Tempo** | Speed | Time to first touch, follow-up cadence |
| **Pawn Structure** | Data foundation | List hygiene, enrichment quality |
| **Opening** | Campaign start | First 3 touches, pattern selection |
| **Middlegame** | Engagement | Multi-touch sequences, objection handling |
| **Endgame** | Close | Pricing negotiation, procurement, signature |

#### 2.1.2 The Evaluation Function

```
CAMPAIGN_SCORE = (MATERIAL × POSITION_MULTIPLIER × MOBILITY) + TEMPO_BONUS

Where:
- MATERIAL = Σ(lead_values) + Σ(email_events) + offer_value + domain_penalty
- POSITION_MULTIPLIER = 0.5 + (position_score / 100)  [range: 0.5-1.5]
- MOBILITY = min(available_sequences / 3, 1.0)
- TEMPO_BONUS = hours_to_first_touch < 24 ? 100 : 0

WIN_PROBABILITY = sigmoid(CAMPAIGN_SCORE / 2000) × 100
EXPECTED_REVENUE = WIN_PROBABILITY × TARGET_ACV / 100
```

#### 2.1.3 Material Values (Centipawn System)

```typescript
const GTM_MATERIAL = {
  // Lead quality (pawns — foundation)
  leadTier1: 100,      // Perfect ICP fit
  leadTier2: 70,       // Good fit
  leadTier3: 40,       // Stretch fit
  leadUnqualified: 10, // Cold/unknown
  
  // Email events (knights/bishops — mobility)
  emailDelivered: 5,
  emailOpened: 15,
  emailClicked: 40,
  emailReplied: 100,
  emailPositiveReply: 150,
  emailMeetingBooked: 500,  // Rook-level value
  
  // Offer strength (queen power)
  offerCompelling: 300,
  offerStandard: 150,
  offerWeak: 50,
  
  // Domain health (king safety — penalties)
  domainExcellent: 0,
  domainGood: -50,
  domainRisky: -200,
  domainBurned: -1000   // Game over
};
```

#### 2.1.4 Position Evaluation

Position score (0-100) derived from:
- **ICP Alignment** (30%): Title/industry match to historical wins
- **Timing** (20%): Seasonality, budget cycles, funding data
- **Competitive Position** (15%): vs known competitors
- **Engagement Depth** (20%): Multi-touch score, content consumed
- **List Health** (15%): Bounce rate, verification status

#### 2.1.5 The Opening Book

Pre-built sequences for common scenarios:

| Scenario | Pattern | Focus |
|----------|---------|-------|
| **Warm intro** | Value → Social Proof → Ask | High position |
| **Cold outbound** | Pattern Interrupt → Problem → Solution → Ask | Build material |
| **Event follow-up** | Context → Value → Ask | Use tempo |
| **Competitive win** | Differentiation → ROI → Ask | Attack king safety |
| **Re-engagement** | New Value → Social Proof → Soft Ask | Salvage position |

---

### 2.2 PILLAR 2: Tag-Based Knowledge Architecture

#### 2.2.1 Core Insight

**Users think in folders, but the system operates on tags.**

Folders are a UI abstraction over `tags.primary`. This gives us:
- Familiar UX (folder navigation)
- System flexibility (cross-cutting tags)
- Agent intelligence (trace lineage, auto-organization)

#### 2.2.2 The Six Primary Tags (Standard Folders)

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE STRUCTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   PROFILE   │  │     ICP     │  │  RESEARCH   │         │
│  │  (Identity) │  │  (Targets)  │  │   (Intel)   │         │
│  │  Building   │  │    Users    │  │  Microscope │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   ASSETS    │  │  CAMPAIGNS  │  │  ANALYSIS   │         │
│  │ (Playbooks) │  │ (Sequences) │  │  (Reports)  │         │
│  │   FileBox   │  │  Megaphone  │  │  BarChart3  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2.3 Document Metadata Schema

```typescript
interface KnowledgeDocument {
  id: string;
  content: string;
  metadata: {
    project_id: string;
    company_id: string;
    tags: {
      primary: 'profile' | 'icp' | 'research' | 'assets' | 'campaign' | 'analysis';
      secondary: string[];        // Extracted keywords
      vertical?: string;          // Industry
      stage: 'draft' | 'review' | 'approved' | 'archived';
    };
    relationships: {
      derived_from?: string[];    // Source documents
      related_to?: string[];      // Peer connections
      used_in?: string[];         // Referencing docs/campaigns
      replaces?: string;          // Versioning
      created_in_session?: string; // Chat traceability
    };
    created_by: 'user' | 'agent' | 'import' | 'upload';
    created_by_agent?: string;    // Which agent created it
    source_file?: {               // For uploads
      original_name: string;
      mime_type: string;
      size_bytes: number;
    };
    created_at: string;
    updated_at: string;
    version: number;
  };
  containerTag: string;  // e.g., "gtm_acme_project_123"
}
```

#### 2.2.4 Auto-Tagging Intelligence

Documents are automatically analyzed and tagged via LLM:

```
INPUT: Document content + filename
OUTPUT: {
  primary: 'research',
  secondary: ['fintech', 'enterprise', 'outreach'],
  vertical: 'fintech',
  confidence: 0.92,
  reasoning: 'Document analyzes fintech buyer behavior'
}
```

#### 2.2.5 Relationship Tracing

Documents maintain bidirectional relationships:

```
Research Doc: "Enterprise Fintech ICP Analysis"
  └── derived_from: [competitor_analysis_doc]
  
Campaign Doc: "Q1 Fintech Outreach"
  └── derived_from: [research_doc_id]
  └── used_in: [follow_up_campaign]

Agent Query: "What research informed this campaign?"
  └── Traverse relationships.derived_from
  └── Return: [Enterprise Fintech ICP Analysis]
```

---

### 2.3 PILLAR 3: Multi-Agent Orchestration

#### 2.3.1 The Session Model

Each UI component gets an **isolated chat session** with scoped context:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-AGENT SESSION MODEL                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  COMPANY NAMESPACE: company:{slug}                                   │
│  └── Shared Supermemory Container                                    │
│                                                                      │
│       ┌──────────────────┐                                          │
│       │   MAIN AGENT     │  Session: company:{slug}:main            │
│       │    (Julian)      │  Context: Full company                    │
│       │                  │  Scope: Strategic decisions               │
│       └──────────────────┘                                          │
│                │                                                     │
│      ┌─────────┼─────────┐                                          │
│      ▼         ▼         ▼                                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                                │
│ │CAMPAIGN │ │ INBOX   │ │RESEARCH │                                │
│ │  AGENT  │ │  AGENT  │ │  AGENT  │                                │
│ │{id}:camp│ │:inbox   │ │:{task}  │                                │
│ │Single   │ │Unread   │ │Background                              │
│ │campaign │ │messages │ │tasks    │                                │
│ └─────────┘ └─────────┘ └─────────┘                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.3.2 Agent Specialization

| Agent | Session Key | Context Scope | System Prompt Focus |
|-------|-------------|---------------|---------------------|
| **Main** | `company:{slug}:main` | Full company | Strategic operations, research |
| **Campaign** | `company:{slug}:campaign:{id}` | Single campaign | Email optimization, targeting |
| **Inbox** | `company:{slug}:inbox` | Reply management | Lead qualification, responses |
| **Research** | `company:{slug}:research:{task}` | Background task | Deep research, competitive intel |

#### 2.3.3 Knowledge Base Integration

Agents create and reference documents via tools:

```typescript
// Agent creates document from valuable chat insight
await agent.runTool('create_document', {
  title: "Fintech Buyer Behavior Analysis",
  content: "...",
  primary_tag: 'research',
  secondary_tags: ['fintech', 'enterprise'],
  project_id: 'proj_123'
});

// Document is tagged, stored, and linked to session
// User sees: "Document Created → View in Knowledge Base"
```

---

### 2.4 PILLAR 4: Company Intake System

#### 2.4.1 Purpose

Comprehensive onboarding that builds the knowledge foundation for AI-driven GTM. Not just data collection — **knowledge synthesis**.

#### 2.4.2 The Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPANY INTAKE PIPELINE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  INPUTS                    PROCESSING              OUTPUTS           │
│  ───────                   ───────────             ───────           │
│                                                                      │
│ ┌────────────┐           ┌────────────┐        ┌────────────┐       │
│ │ Onboarding │──────────▶│  Profile   │───────▶│  Company   │       │
│ │    Form    │           │  Builder   │        │   Memory   │       │
│ └────────────┘           └────────────┘        └────────────┘       │
│                                                                      │
│ ┌────────────┐           ┌────────────┐        ┌────────────┐       │
│ │   File     │──────────▶│  Document  │───────▶│ Knowledge  │       │
│ │  Uploads   │           │  Analyzer  │        │   Graph    │       │
│ └────────────┘           └────────────┘        └────────────┘       │
│                                                                      │
│ ┌────────────┐           ┌────────────┐        ┌────────────┐       │
│ │  PlusVibe  │──────────▶│  Campaign  │───────▶│ Historical │       │
│ │   Import   │           │  Analyzer  │        │  Insights  │       │
│ └────────────┘           └────────────┘        └────────────┘       │
│                                                                      │
│ ┌────────────┐           ┌────────────┐        ┌────────────┐       │
│ │  Close     │──────────▶│   Deal     │───────▶│    ICP     │       │
│ │    CRM     │           │  Pattern   │        │ Refinement │       │
│ │   Sync     │           │  Analyzer  │        │            │       │
│ └────────────┘           └────────────┘        └────────────┘       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.4.3 Supermemory Storage Structure

```
company:{slug}:profile     → Core identity, value prop
company:{slug}:icp         → Ideal customer profiles
company:{slug}:campaigns   → Historical campaigns
company:{slug}:assets      → Documents & content
company:{slug}:analytics   → Performance baselines
company:{slug}:executions  → Skill execution logs
company:{slug}:insights    → Generated insights
```

#### 2.4.4 Progressive Learning Loop

```
Intake (Baseline)
       │
       ▼
Campaign Execution
       │
       ▼
Results Capture
       │
       ▼
Analysis (Pattern Detection)
       │
       ▼
Insight Extraction
       │
       ▼
Profile Update
       │
       ▼
Better Next Campaign
```

---

### 2.5 PILLAR 5: Skill Execution & Memory

#### 2.5.1 The Problem with Binary Thinking

```
❌ WRONG: "15% reply rate = high performer"
✅ CORRECT: "15% reply rate, but 60% OOO, 20% negative, 2% positive = underperformer"
```

#### 2.5.2 Multi-Dimensional Truth

Every insight has **6 dimensions of validity**:

| Dimension | Stored As | Purpose |
|-----------|-----------|---------|
| **Accuracy** | `confidence_score` (0-1) | How likely this is correct |
| **Completeness** | `completeness_score` (0-1) | What data is missing |
| **Timeliness** | `valid_until` (timestamp) | When this expires |
| **Source Quality** | `source_tier` (primary/derived/inferred) | How we know this |
| **Nuance** | `caveats[]` (array) | Warnings and edge cases |
| **Provenance** | `lineage` (execution trace) | Full audit trail |

#### 2.5.3 Abstract Pattern Recognition

Instead of binary labels, store abstract patterns:

| Category | Patterns |
|----------|----------|
| **Performance** | `high_volume_low_quality`, `high_quality_low_volume`, `volatile`, `declining_trend` |
| **ICP** | `strong_fit_high_engagement`, `weak_fit_high_engagement`, `unexpected_responder` |
| **Timing** | `seasonal_peak`, `budget_cycle_aligned`, `funding_triggered` |

#### 2.5.4 Skill Execution Record

```typescript
interface SkillExecution {
  id: string;
  skill_name: string;
  company_id: string;
  session_key: string;
  
  // Full context snapshot
  context: {
    input_parameters: object;
    supermemory_state: object;
    chat_history: Message[];
  };
  
  // Step-by-step trace
  execution_trace: Array<{
    step: number;
    tool: string;
    input: object;
    output: object;
    timestamp: string;
  }>;
  
  // Generated insights
  insights: GeneratedInsight[];
  
  // User feedback
  user_feedback?: {
    accuracy_rating: 1-5;
    corrections: string;
    applied_at: string;
  };
}
```

---

## 3. SYSTEM ARCHITECTURE

### 3.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐           │
│  │   USER   │────▶│    UI    │────▶│   API    │────▶│SUPABASE  │           │
│  │          │◀────│          │◀────│  ROUTES  │◀────│(Metadata)│           │
│  └──────────┘     └──────────┘     └────┬─────┘     └──────────┘           │
│                                          │                                  │
│                                          ▼                                  │
│                              ┌───────────────────┐                         │
│                              │   AGENT LAYER     │                         │
│                              │  (OpenClaw RPC)   │                         │
│                              └─────────┬─────────┘                         │
│                                        │                                    │
│                    ┌───────────────────┼───────────────────┐               │
│                    ▼                   ▼                   ▼               │
│              ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│              │PlusVibe  │      │SUPERMORY │      │  Close   │             │
│              │(Campaigns│      │(Memory)  │      │   CRM    │             │
│              │  Replies)│      │          │      │ (Deals)  │             │
│              └──────────┘      └──────────┘      └──────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 14 + React + Tailwind | UI, routing, SSR |
| **Backend** | Next.js API Routes + Edge Functions | API endpoints |
| **Database** | Supabase (PostgreSQL) | Metadata, auth, project structure |
| **Memory** | Supermemory v3 API | Document storage, embeddings, search |
| **AI Gateway** | OpenClaw | Multi-agent orchestration |
| **Campaign Data** | PlusVibe API | Historical campaigns, replies |
| **CRM** | Close CRM API | Deals, opportunities |
| **Hosting** | DigitalOcean Droplets | Containerized OpenClaw agents |
| **Scheduler** | OpenClaw Cron | Automated monitoring, reports |

### 3.3 Key Integration Points

#### 3.3.1 OpenClaw Integration

```typescript
// SSH-tunneled WebSocket RPC for agent communication
const result = await chatSend({
  containerUrl: "ws://159.65.220.183:18790",
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
  message: "Analyze this campaign performance",
  sessionKey: "company:supersauce:campaign:123",
  agentId: "campaign-agent"
});
```

#### 3.3.2 Supermemory Storage

```typescript
// Document with rich metadata
await supermemory.addDocument({
  content: "Fintech enterprise buyers prefer...",
  metadata: {
    project_id: "proj_123",
    company_id: "comp_456",
    tags: {
      primary: 'research',
      secondary: ['fintech', 'enterprise'],
      stage: 'approved'
    },
    relationships: {
      derived_from: ['doc_001'],
      created_in_session: 'sess_789'
    }
  },
  containerTag: "gtm_supersauce_project_123"
});
```

#### 3.3.3 PlusVibe Data Flow

```
PlusVibe API → Campaign Detector (cron) → Supermemory
                    ↓
              New campaign detected
                    ↓
              Auto-tag and store
                    ↓
              Notify user via Telegram
```

---

## 4. V1 SCOPE & STATUS

### 4.1 What's Built ✅

| Component | Status | Location |
|-----------|--------|----------|
| OpenClaw Client ( stabilized Feb 20) | ✅ | `src/lib/openclaw-client.ts` |
| Company Intake Pipeline | ✅ | `src/lib/intake/` |
| Profile Builder | ✅ | `src/lib/intake/profile-builder.ts` |
| Supermemory Sync | ✅ | `src/lib/supermemory/` |
| Project Management API | ✅ | `src/app/api/knowledge/projects/` |
| Chat System (streaming) | ✅ | `src/lib/chat/` |
| Campaign List/Detail UI | ✅ | `src/app/campaigns/` |
| Inbox Management | ✅ | `src/app/inbox/` |
| Agent Provisioning | ✅ | `src/lib/agent-provisioning.ts` |
| Skill System Framework | ✅ | `src/lib/skills/` |

### 4.2 What's Missing 🟡

| Component | Effort | Blocks |
|-----------|--------|--------|
| Chess Engine Scoring API | 12 hrs | Campaign evaluation |
| Auto-Tagger Service | 6 hrs | Knowledge organization |
| PlusVibe Importer (real) | 6 hrs | Historical data |
| Close CRM Importer (real) | 6 hrs | Deal patterns |
| Document Analyzer | 8 hrs | PDF processing |
| Agent Chat Tools (create_document) | 4 hrs | Chat-KB integration |
| Opening Book Sequences | 8 hrs | Campaign templates |
| Dashboard Performance Fixes | 6 hrs | UX |

### 4.3 V1 Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Campaign Score Accuracy | 70%+ correlation with win rate | Backtest 50 campaigns |
| Auto-Tag Confidence | 85%+ average | LLM confidence scores |
| Time to Evaluation | <2 seconds | API latency |
| Knowledge Base Usage | 3+ docs created per week | Analytics |
| User Engagement | 5+ evaluations per week | Dashboard metrics |

---

## 5. KEY INNOVATIONS

### 5.1 Computational GTM

Traditional: "This campaign feels strong"  
Blitzscale: "This campaign scores +850 (Better) with 73% win probability based on material count and position evaluation"

### 5.2 Institutional Memory

Traditional: Knowledge walks out the door with people  
Blitzscale: Every insight, campaign, and result is tagged, stored, and queryable forever

### 5.3 Multi-Agent Parallelism

Traditional: One person context-switching between research, writing, analysis  
Blitzscale: Specialized agents working in parallel, each with isolated context

### 5.4 Progressive Learning

Traditional: Start from scratch with each new campaign  
Blitzscale: Each execution feeds results back, refining ICP and improving predictions

---

## 6. VISUAL FRAMEWORK OPPORTUNITIES

For Opus visualization, consider these schematics:

1. **The Chess Board** — Campaign pieces positioned on a market board, with material vs position visualization

2. **The Knowledge Graph** — Document nodes connected by `derived_from`, `used_in`, `related_to` relationships

3. **The Agent Network** — Multiple agents (Main, Campaign, Inbox, Research) with shared Supermemory hub

4. **The Intake Pipeline** — Data sources flowing through processors into structured knowledge

5. **The Evaluation Dashboard** — "Material vs Position" scatter plot with win probability contours

6. **The Learning Loop** — Circular diagram showing intake → execution → analysis → insight → update

---

## 7. FUTURE ROADMAP

### V2 (Next Quarter)
- Real-time campaign adaptation based on early signals
- Multi-campaign portfolio optimization
- Predictive lead scoring
- Competitive intelligence automation

### V3 (Next Half)
- End-to-end automation (prospecting to close)
- Multi-channel orchestration (email, LinkedIn, phone)
- Custom skill marketplace
- AI-generated campaign sequences

---

## 8. CONCLUSION

Blitzscale OS represents a paradigm shift in GTM operations — from intuition to calculation, from scattered to structured, from reactive to predictive. By combining chess engine evaluation, tag-based knowledge architecture, and multi-agent orchestration, we create a system that doesn't just store data but actively thinks about how to win.

The foundation is built. The architecture is clear. What remains is execution.

---

**Document Version:** 1.0  
**Last Updated:** February 25, 2026  
**Author:** Julian (AI Head of Operations, Blitzscale OS)  
**System:** Blitzscale OS / GTM Engine  
