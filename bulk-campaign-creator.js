/**
 * GTM Bulk Campaign Creator
 *
 * Creates all 18 PlusVibe campaigns from the campaign playbook
 *
 * Usage: node bulk-campaign-creator.js --dry-run (to preview)
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';

// All 18 Campaigns
const CAMPAIGNS = [
  {
    name: 'Staffing - Director of BD - 2026-02-09',
    industry: 'Staffing',
    target: 'Director of Business Development',
    tier: 'Fuel',
    volume: '500/week',
    framework: 'deliverability-audit'
  },
  {
    name: 'Staffing - VP of Sales - 2026-02-09',
    industry: 'Staffing',
    target: 'VP of Sales',
    tier: 'Engine',
    volume: '300/week',
    framework: 'done-for-you'
  },
  {
    name: 'Staffing - Agency Owner - 2026-02-09',
    industry: 'Staffing',
    target: 'Owner/Partner/Founder',
    tier: 'Fuel or Engine',
    volume: '300/week',
    framework: 'scale-angle'
  },
  {
    name: 'Sales Outsourcing - VP of Sales - 2026-02-09',
    industry: 'Sales Outsourcing',
    target: 'VP of Sales',
    tier: 'Engine',
    volume: '500/week',
    framework: 'client-churn'
  },
  {
    name: 'Sales Outsourcing - Director of Sales Ops - 2026-02-09',
    industry: 'Sales Outsourcing',
    target: 'Director of Sales Operations',
    tier: 'Fuel or Engine',
    volume: '300/week',
    framework: 'ramp-time'
  },
  {
    name: 'SaaS - VP of Sales - 2026-02-09',
    industry: 'SaaS',
    target: 'VP of Sales',
    tier: 'Engine',
    volume: '500/week',
    framework: 'pipeline-consistency'
  },
  {
    name: 'SaaS - CRO - 2026-02-09',
    industry: 'SaaS',
    target: 'Chief Revenue Officer',
    tier: 'Engine',
    volume: '200/week',
    framework: 'systematic-outbound'
  },
  {
    name: 'MSP - VP of Sales - 2026-02-09',
    industry: 'MSP',
    target: 'VP of Sales',
    tier: 'Fuel',
    volume: '300/week',
    framework: 'msp-differentiation'
  },
  {
    name: 'MSP - Owner - 2026-02-09',
    industry: 'MSP',
    target: 'Owner/Founder',
    tier: 'Foundation or Fuel',
    volume: '300/week',
    framework: 'lead-flow'
  },
  {
    name: 'Fintech - VP of Sales - 2026-02-09',
    industry: 'Fintech',
    target: 'VP of Sales',
    tier: 'Fuel or Engine',
    volume: '200/week',
    framework: 'fintech-diff'
  },
  {
    name: 'Healthcare IT - VP of Sales - 2026-02-09',
    industry: 'Healthcare IT',
    target: 'VP of Sales',
    tier: 'Fuel',
    volume: '150/week',
    framework: 'compliance'
  },
  {
    name: 'Professional Services - Managing Partner (Law) - 2026-02-09',
    industry: 'Legal',
    target: 'Managing Partner',
    tier: 'Foundation',
    volume: '100/week',
    framework: 'client-flow'
  },
  {
    name: 'Professional Services - Owner (CPA) - 2026-02-09',
    industry: 'Accounting',
    target: 'Owner/Partner',
    tier: 'Foundation',
    volume: '100/week',
    framework: 'year-round'
  },
  {
    name: 'SaaS - VP of Marketing - 2026-02-09',
    industry: 'SaaS',
    target: 'VP of Marketing',
    tier: 'Fuel',
    volume: '200/week',
    framework: 'sales-mktg-alignment'
  },
  {
    name: 'SaaS - Founder/CEO - 2026-02-09',
    industry: 'SaaS',
    target: 'Founder/CEO',
    tier: 'Foundation or Fuel',
    volume: '300/week',
    framework: 'no-sdr'
  },
  {
    name: 'SaaS - Director of Demand Gen - 2026-02-09',
    industry: 'SaaS',
    target: 'Director of Demand Generation',
    tier: 'Fuel or Engine',
    volume: '200/week',
    framework: 'roi-visibility'
  },
  {
    name: 'E-commerce - Head of Growth - 2026-02-09',
    industry: 'E-commerce',
    target: 'Head of Growth',
    tier: 'Fuel',
    volume: '150/week',
    framework: 'b2b-outreach'
  },
  {
    name: 'Marketing Agency - VP of Sales - 2026-02-09',
    industry: 'Marketing Agency',
    target: 'VP of Sales',
    tier: 'Fuel or Engine',
    volume: '200/week',
    framework: 'agency-stand-out'
  }
];

// Framework templates
const FRAMEWORKS = {
  'deliverability-audit': {
    subjects: [
      '{{first_name}}, built this for {{company}}',
      '{{first_name}} – sending 200 emails for 1 reply?',
      '{{first_name}} – 5x reply rates in 30 days?'
    ],
    hook: 'Deliverability Audit'
  },
  'done-for-you': {
    subjects: [
      '{{first_name}} – interested in done-for-you outbound?',
      '{{first_name}} – SDR turnover killing your pipeline?',
      '{{first_name}} – predictable pipeline without hiring?'
    ],
    hook: 'Done For You'
  },
  'scale-angle': {
    subjects: [
      '{{first_name}}, created a campaign blueprint for {{company}}',
      '{{first_name}} – competitors winning on follow-up?',
      '{{first_name}} – 30% more revenue, same headcount?'
    ],
    hook: 'Scale Blueprint'
  },
  'client-churn': {
    subjects: [
      '{{first_name}} – interested in 2x reply rates?',
      '{{first_name}} – clients churning from missed guarantees?',
      '{{first_name}} – saw {{company}} scaling to 40+ SDRs'
    ],
    hook: 'Client Churn'
  },
  'ramp-time': {
    subjects: [
      '{{first_name}} – 25% of SDR payroll producing zero revenue?',
      '{{first_name}} – saw {{company}} hiring SDRs again',
      '{{first_name}} – interested in cutting SDR ramp time in half?'
    ],
    hook: 'Ramp Time'
  },
  'pipeline-consistency': {
    subjects: [
      '{{first_name}} – pipeline swinging 40% month-to-month?',
      '{{first_name}} – predictable pipeline in 30 days?',
      '{{first_name}} – saw {{company}} just raised Series B'
    ],
    hook: 'Pipeline Consistency'
  },
  'systematic-outbound': {
    subjects: [
      '{{first_name}} – interested in systematic outbound?',
      '{{first_name}} – outbound consistency killing your forecast?',
      're: systematic outbound'
    ],
    hook: 'Systematic Outbound'
  },
  'msp-differentiation': {
    subjects: [
      '{{first_name}}, created MSP campaign blueprint for {{company}}',
      '{{first_name}} – MSP cold emails landing in spam?',
      '{{first_name}} – saw {{company}} expanding into healthcare IT'
    ],
    hook: 'MSP Differentiation'
  },
  'lead-flow': {
    subjects: [
      '{{first_name}} – tired of sounding like every other MSP?',
      '{{first_name}} – interested in predictable lead flow?',
      'quick question'
    ],
    hook: 'Lead Flow'
  },
  'fintech-diff': {
    subjects: [
      '{{first_name}} – fintech cold emails getting ignored?',
      '{{first_name}}, created fintech campaign blueprint',
      '{{first_name}} – saw {{company}} expanding merchant base'
    ],
    hook: 'Fintech Differentiation'
  },
  'compliance': {
    subjects: [
      '{{first_name}} – healthcare outreach getting filtered?',
      '{{first_name}}, created healthcare IT blueprint',
      'quick question'
    ],
    hook: 'Compliance'
  },
  'client-flow': {
    subjects: [
      '{{first_name}} – referrals drying up?',
      '{{first_name}} – interested in predictable client flow?',
      'quick question'
    ],
    hook: 'Client Flow'
  },
  'year-round': {
    subjects: [
      '{{first_name}} – client acquisition only works in Q1?',
      '{{first_name}} – interested in leads outside of tax season?',
      'quick question'
    ],
    hook: 'Year Round'
  },
  'sales-mktg-alignment': {
    subjects: [
      '{{first_name}} – sales blaming marketing for lead quality?',
      '{{first_name}} – need to prove outbound ROI?',
      'quick question'
    ],
    hook: 'Sales Marketing Alignment'
  },
  'no-sdr': {
    subjects: [
      '{{first_name}} – interested in outbound without hiring SDRs?',
      '{{first_name}} – doing cold email yourself?',
      'quick question'
    ],
    hook: 'No SDR'
  },
  'roi-visibility': {
    subjects: [
      '{{first_name}} – outbound ROI hard to prove?',
      '{{first_name}} – need better outbound attribution?',
      'quick question'
    ],
    hook: 'ROI Visibility'
  },
  'b2b-outreach': {
    subjects: [
      '{{first_name}}, created B2B blueprint for {{company}}',
      '{{first_name}} – struggling with B2B partnerships?',
      'quick question'
    ],
    hook: 'B2B Outreach'
  },
  'agency-stand-out': {
    subjects: [
      '{{first_name}} – agency cold emails landing in spam?',
      '{{first_name}} – tired of sounding like every other agency?',
      'quick question'
    ],
    hook: 'Agency Stand Out'
  }
};

// Generate email body
function generateBody(framework, step) {
  const templates = {
    1: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>{{custom_content}}</div>
<div><br></div>
<div>Want to see more?</div>
<div><br></div>
<div>Best,<br>David</div>`,
    2: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>{{custom_content}}</div>
<div><br></div>
<div>Quick look?</div>
<div><br></div>
<div>Best,<br>David</div>`,
    3: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>{{custom_content}}</div>
<div><br></div>
<div>Thoughts?</div>
<div><br></div>
<div>Best,<br>David</div>`
  };
  
  return templates[step];
}

// API Functions
async function createCampaign(name) {
  const response = await fetch('https://api.plusvibe.ai/api/v1/campaign/add/campaign', {
    method: 'POST',
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      camp_name: name,
      workspace_id: PLUSVIBE_WORKSPACE_ID
    })
  });
  
  const data = await response.json();
  return data;
}

async function updateCampaign(id, name, frameworkKey) {
  const fw = FRAMEWORKS[frameworkKey];
  
  const response = await fetch('https://api.plusvibe.ai/api/v1/campaign/update/campaign', {
    method: 'PATCH',
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspace_id: PLUSVIBE_WORKSPACE_ID,
      campaign_id: id,
      camp_name: name,
      first_wait_time: 1,
      sequences: [
        {
          step: 1,
          wait_time: 1,
          variations: [{
            variation: 'A',
            subject: fw.subjects[0],
            name: fw.hook,
            body: generateBody(frameworkKey, 1)
          }]
        },
        {
          step: 2,
          wait_time: 3,
          variations: [{
            variation: 'A',
            subject: fw.subjects[1],
            name: `${fw.hook} - Follow Up`,
            body: generateBody(frameworkKey, 2)
          }]
        },
        {
          step: 3,
          wait_time: 5,
          variations: [{
            variation: 'A',
            subject: fw.subjects[2],
            name: `${fw.hook} - Final`,
            body: generateBody(frameworkKey, 3)
          }]
        }
      ]
    })
  });
  
  return response.json();
}

async function activateCampaign(id) {
  const response = await fetch('https://api.plusvibe.ai/api/v1/campaign/activate', {
    method: 'POST',
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campaign_id: id,
      workspace_id: PLUSVIBE_WORKSPACE_ID
    })
  });
  
  return response.json();
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const activate = args.includes('--activate');
  
  console.log('='.repeat(70));
  console.log('GTM BULK CAMPAIGN CREATOR');
  console.log('='.repeat(70));
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Activate: ${activate}`);
  console.log(`Campaigns: ${CAMPAIGNS.length}`);
  console.log('');
  
  if (dryRun) {
    console.log('📋 PREVIEW - Campaigns to create:\n');
    CAMPAIGNS.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name}`);
      console.log(`   Target: ${c.target} | Tier: ${c.tier} | Volume: ${c.volume}`);
      console.log(`   Framework: ${c.framework}`);
      console.log('');
    });
    return;
  }
  
  console.log('🚀 Creating campaigns...\n');
  
  let created = 0;
  let failed = 0;
  
  for (const campaign of CAMPAIGNS) {
    process.stdout.write(`${created + failed + 1}. ${campaign.name.substring(0, 50)}... `);
    
    try {
      // Create campaign
      const createResult = await createCampaign(campaign.name);
      
      if (!createResult.id) {
        console.log('❌ Failed to create');
        failed++;
        continue;
      }
      
      // Add sequences
      await updateCampaign(createResult.id, campaign.name, campaign.framework);
      
      // Activate if requested
      if (activate) {
        await activateCampaign(createResult.id);
      }
      
      console.log('✅ Created');
      created++;
      
      // Rate limit protection
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      console.log(`❌ ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS: ${created} created, ${failed} failed`);
  console.log('='.repeat(70));
  
  if (activate) {
    console.log('\n⚠️  Campaigns created but NOT activated (remove --activate to preview first)');
  } else {
    console.log('\n✅ All campaigns created as DRAFTS');
    console.log('Run with --activate to activate them');
  }
}

main().catch(console.error);
