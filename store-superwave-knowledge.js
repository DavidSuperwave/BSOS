/**
 * Store Superwave ICP Knowledge in Supermemory
 */

const { storeLearning } = require('./supermemory');

async function main() {
  console.log('Storing Superwave ICP Knowledge...\n');

  // Store ICP Insight
  console.log('1. Storing Marketing Agency ICP...');
  await storeLearning('icp', {
    industry: 'Marketing Agencies',
    persona: 'Founder/COO/VP Sales',
    painPoints: [
      'Scaling cold outreach',
      'Burning domains',
      'Poor deliverability',
      'Wasting money on bad data'
    ],
    offers: [
      'Guaranteed infrastructure (95%+ deliverability)',
      'AI-powered campaigns',
      'Bespoke human-verified data',
      'Managed service vs DIY'
    ],
    avoid: [
      'HR Directors - wrong buyer',
      'Executive Directors - wrong buyer',
      'Retired C-level - left company',
      'Non-English markets - no localization'
    ]
  });
  console.log('   ✅ Stored\n');

  // Store ICP Insight - Brokerages
  console.log('2. Storing Brokerage ICP...');
  await storeLearning('icp', {
    industry: 'Brokerages',
    persona: 'Founder/COO/VP Sales',
    painPoints: [
      'Scaling lead generation',
      'Inconsistent lead quality',
      'Email going to spam',
      'No time for manual outreach'
    ],
    offers: [
      'Scalable outbound engine',
      'High-quality leads',
      'Guaranteed inbox placement',
      'Full automation'
    ],
    avoid: [
      'Individual agents - not decision makers',
      'Retired principals',
      'Non-US brokers'
    ]
  });
  console.log('   ✅ Stored\n');

  // Store Campaign Learning
  console.log('3. Storing Campaign Performance...');
  await storeLearning('campaign', {
    name: 'Superwave Infra - AI Intro',
    industry: 'Marketing Agencies',
    role: 'Founder/COO',
    replyRate: 1.97,
    positiveRate: 0.44,
    bestFramework: 'Infrastructure guarantee'
  });
  console.log('   ✅ Stored\n');

  // Store Targeting Rules
  console.log('4. Storing Targeting Rules...');
  await storeLearning('targeting', {
    industry: 'B2B Outbound',
    include: [
      'Marketing Agencies (US-based)',
      'Brokerages (US-based)',
      'B2B SaaS companies ($1M-$50M revenue)',
      'Funding companies',
      'Founder/CEO/COO/VP Sales/VP Marketing roles'
    ],
    exclude: [
      'HR Directors',
      'Executive Directors',
      'Retired C-level',
      'Non-US contacts',
      'Emails with no verifiable role'
    ]
  });
  console.log('   ✅ Stored\n');

  // Store Deliverability Record
  console.log('5. Storing Deliverability Baseline...');
  await storeLearning('deliverability', {
    account: 'Superwave - David Workspace',
    inboxRate: 68.57, // 100 - 28.57% OOO - 2.86% bounce
    spamRate: 2.86,
    issues: [
      'High OOO rate (28.57%)',
      'List quality issues (wrong ICP)',
      'Geographic targeting (non-US responses)'
    ],
    fixes: [
      'Verify emails before import',
      'Filter by role (LinkedIn enrichment)',
      'Better geo-targeting (US only)'
    ],
    trend: 'stable'
  });
  console.log('   ✅ Stored\n');

  console.log('✅ All Superwave knowledge stored in Supermemory!');
  console.log('\nNext: Query with "Marketing Agency ICP" or "Superwave campaign" to retrieve.');
}

main().catch(console.error);
