#!/usr/bin/env node
/**
 * Seed Supermemory with initial Superwave company knowledge
 * 
 * This populates the company namespace with:
 * - Company profile and services
 * - ICP definitions
 * - Campaign best practices
 * - Email templates and frameworks
 */

import Supermemory from 'supermemory';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from both locations
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'ui/.env.local') });

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const COMPANY_ID = 'superwave';
const NAMESPACE = `blitzscale:company:${COMPANY_ID}`;

if (!SUPERMEMORY_API_KEY) {
  console.error('❌ SUPERMEMORY_API_KEY not found in environment');
  process.exit(1);
}

// Initialize client
const client = new Supermemory({
  apiKey: SUPERMEMORY_API_KEY,
});

// ============================================
// KNOWLEDGE DOCUMENTS TO SEED
// ============================================

const documents = [
  {
    title: 'Superwave Company Profile',
    category: 'company_profile',
    content: `
# Superwave - Company Overview

## What We Do
Superwave is a B2B cold email agency specializing in AI-powered outreach automation. 
We help companies generate qualified leads through hyper-personalized email campaigns.

## Services
1. **Cold Email Campaigns** - End-to-end campaign management
2. **Email Infrastructure Setup** - Domain warming, deliverability optimization
3. **Lead Research** - ICP-driven prospect identification
4. **AI Personalization** - Automated message customization at scale
5. **Reply Management** - Response handling and qualification

## Key Differentiators
- AI-native approach (not just templates + mail merge)
- Focus on B2B SaaS and tech companies
- Performance-based pricing available
- White-label services for agencies

## Tech Stack
- PlusVibe for campaign management
- Close CRM for pipeline tracking
- Perplexity for real-time research
- Custom AI for personalization
`
  },
  {
    title: 'Superwave ICP Definition',
    category: 'icp',
    content: `
# Ideal Customer Profile (ICP)

## Primary ICP: B2B SaaS Startups
- **Company Size:** 10-100 employees
- **Revenue:** $1M-$20M ARR
- **Stage:** Series A to Series B
- **Has:** SDR team or founder doing sales
- **Pain:** Inconsistent pipeline, high CAC
- **Budget:** $5k-$15k/month for outreach

## Secondary ICP: B2B Agencies
- **Type:** Marketing, Dev, Design agencies
- **Size:** 5-30 employees
- **Pain:** Feast-or-famine client acquisition
- **Looking for:** White-label outreach partner

## Anti-ICP (Avoid)
- Enterprise companies (slow sales cycles)
- B2C companies (different channel needs)
- Early-stage pre-product (no budget)
- Companies with <$2k budget

## Buying Signals
- Recently raised funding
- Hiring SDRs/AEs on LinkedIn
- Active on Twitter discussing GTM
- Using competitors like Instantly, Apollo
`
  },
  {
    title: 'Email Copy Best Practices',
    category: 'templates',
    content: `
# Cold Email Framework

## Core Principles
1. **Brevity wins** - Under 75 words for initial email
2. **Pattern disrupt** - Don't look like every other cold email
3. **Hyper-relevance** - Show you know their situation
4. **Clear CTA** - One simple ask

## Winning Structure (AIDA Variant)
1. **Hook** (1 line) - Pattern interrupt or observation
2. **Relevance** (1-2 lines) - Why reaching out to them specifically
3. **Value** (1-2 lines) - What's in it for them
4. **CTA** (1 line) - Simple ask, low commitment

## Example Template
Subject: Quick question about {company}

Hey {first_name},

Noticed you just raised your Series A - congrats! 

Curious how you're thinking about outbound now that you have fuel to scale.

We've helped 3 other SaaS companies at your stage 2-3x their demo pipeline in 90 days through AI-powered cold email.

Worth a quick chat?

## Follow-up Sequence
- Follow-up 1 (Day 3): Short bump, different angle
- Follow-up 2 (Day 7): Social proof drop
- Follow-up 3 (Day 14): Breakup email with value add

## Subject Line Formulas
- "Quick question about {company}"
- "{First_name} - {mutual_connection} mentioned you"  
- "re: outbound at {company}"
- "{Competitor} + {their company}"
`
  },
  {
    title: 'Campaign Performance Benchmarks',
    category: 'analytics',
    content: `
# Performance Benchmarks

## Email Metrics (Good → Great → Elite)
| Metric | Good | Great | Elite |
|--------|------|-------|-------|
| Open Rate | 40-50% | 50-60% | 60%+ |
| Reply Rate | 2-5% | 5-10% | 10%+ |
| Positive Reply | 30-40% | 40-60% | 60%+ |
| Meeting Book | 1-2% | 2-5% | 5%+ |

## Deliverability Targets
- Inbox placement: 90%+
- Spam rate: <2%
- Bounce rate: <3%
- Domain reputation: Green

## Volume Guidelines
- Per mailbox: 30-50 emails/day max
- Warm-up period: 2-4 weeks
- Domain age: 2+ weeks before sending
- Rotate domains every 3-6 months

## Campaign Iteration Cycles
- Test new angles: Weekly
- Full copy refresh: Monthly
- ICP refinement: Quarterly
`
  },
  {
    title: 'Objection Handling Playbook',
    category: 'sales',
    content: `
# Common Objections & Responses

## "We do outbound in-house"
Response: "Totally get it. Most of our clients started that way too. Quick question - are you hitting your pipeline targets consistently? We usually work alongside internal teams to handle the volume you can't get to."

## "We tried cold email, it doesn't work"
Response: "Makes sense you'd be skeptical. 90% of cold email sucks. Mind if I ask what your open and reply rates were? We consistently hit 50%+ opens and 8%+ replies - happy to share how we do it differently."

## "Too expensive"
Response: "Totally fair. What would the ROI need to look like for this to make sense? If we could book you 10+ qualified demos per month, what's that worth to your business?"

## "Not the right time"
Response: "Got it. When would be better to reconnect? And just curious - what would need to change for outbound to become a priority?"

## "Send me more info"
Response: "Happy to! Quick question first - what specifically would you want to see? That way I can send something actually relevant vs a generic PDF."
`
  }
];

// ============================================
// SEEDING FUNCTIONS
// ============================================

async function seedDocument(doc) {
  try {
    console.log(`📝 Seeding: ${doc.title}...`);
    
    const result = await client.add({
      content: doc.content,
      containerTags: [NAMESPACE, `category:${doc.category}`],
      metadata: {
        title: doc.title,
        category: doc.category,
        companyId: COMPANY_ID,
        createdAt: new Date().toISOString(),
        source: 'seed_script',
      }
    });
    
    console.log(`✅ Seeded: ${doc.title}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to seed ${doc.title}:`, error.message);
    return null;
  }
}

async function verifySeeding() {
  try {
    console.log('\n🔍 Verifying seeded documents...');
    
    const results = await client.search.documents({
      q: 'Superwave',
      containerTags: [NAMESPACE],
      limit: 10,
    });
    
    console.log(`✅ Found ${results.documents?.length || 0} documents in namespace`);
    
    if (results.documents) {
      results.documents.forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.metadata?.title || 'Untitled'}`);
      });
    }
    
    return results;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Supermemory Seeding Script');
  console.log(`📦 Namespace: ${NAMESPACE}`);
  console.log(`📄 Documents to seed: ${documents.length}\n`);
  
  // Test connection first
  try {
    console.log('🔗 Testing Supermemory connection...');
    // Simple test - search for anything
    await client.search.documents({ q: 'test', limit: 1 });
    console.log('✅ Connected to Supermemory\n');
  } catch (error) {
    console.error('❌ Failed to connect to Supermemory:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Verify API key is correct');
    console.log('2. Check if account is active at supermemory.ai');
    console.log('3. Ensure you have SDK v4.0.0 or higher');
    process.exit(1);
  }
  
  // Seed all documents
  let successCount = 0;
  for (const doc of documents) {
    const result = await seedDocument(doc);
    if (result) successCount++;
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 Seeding complete: ${successCount}/${documents.length} documents`);
  
  // Verify
  await verifySeeding();
  
  console.log('\n✨ Done!');
}

main().catch(console.error);
