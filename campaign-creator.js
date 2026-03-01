/**
 * GTM Campaign Creator
 *
 * Creates PlusVibe campaigns from ICP data and email frameworks
 *
 * Usage: node campaign-creator.js --icp=marketing-agencies --test-mode
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

// Configuration
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';

// Email Frameworks (F1-F6)
const FRAMEWORKS = {
  F1: {
    name: 'The Infrastructure Pain Framework',
    subjects: [
      'Your cold emails are landing in spam',
      '{{company}} is likely burning domains',
      'The email infrastructure problem'
    ],
    hook: 'Infrastructure Pain',
    bestFor: 'Marketing Agencies, Brokerages'
  },
  F2: {
    name: 'The Data Quality Framework',
    subjects: [
      '{{company}} is wasting money on bad data',
      'Your lead data is stale',
      'Bad data = wasted outreach'
    ],
    hook: 'Data Quality',
    bestFor: 'B2B SaaS, Funding'
  },
  F3: {
    name: 'The Scale Without Hiring Framework',
    subjects: [
      '10x outreach without hiring',
      'Outbound on autopilot',
      '{{company}} shouldn\'t be doing SDR work'
    ],
    hook: 'Scale Without Hiring',
    bestFor: 'Mid-market SaaS'
  },
  F4: {
    name: 'The YC Credibility Framework',
    subjects: [
      '200+ YC companies trust us',
      'How {{company}} handles email at scale',
      'What works in cold outreach (2025)'
    ],
    hook: 'YC Credibility',
    bestFor: 'Tech-forward companies'
  },
  F5: {
    name: 'The Domain Preservation Framework',
    subjects: [
      'Is your domain at risk?',
      'One campaign could burn your domain',
      'Protect your domain while scaling'
    ],
    hook: 'Domain Preservation',
    bestFor: 'Enterprise, Risk-averse'
  },
  F6: {
    name: 'The Comparison Framework',
    subjects: [
      'Not 11x.ai — here\'s why',
      'Comparing AI SDRs? Read this first',
      'The partner model vs. autonomous AI'
    ],
    hook: 'Comparison',
    bestFor: 'Sophisticated buyers'
  }
};

// ICP Templates
const ICP_TEMPLATES = {
  'marketing-agencies': {
    name: 'Marketing Agencies - Infrastructure Pain',
    framework: 'F1',
    painPoints: [
      'Burning domains',
      'Poor deliverability',
      'Wasting budget on bad data'
    ],
    offer: 'Guaranteed 95%+ inbox placement',
    excludeRoles: ['HR Director', 'Executive Director']
  },
  'brokerages': {
    name: 'Brokerages - Data Quality',
    framework: 'F2',
    painPoints: [
      'Inconsistent lead quality',
      'Spam folder issues',
      'Manual outreach'
    ],
    offer: 'Bespoke, human-verified data',
    excludeRoles: ['Individual Agent']
  },
  'b2b-saas': {
    name: 'B2B SaaS - Scale Without Hiring',
    framework: 'F3',
    painPoints: [
      'No dedicated sales team',
      'Manual SDR work',
      'Can\'t scale outreach'
    ],
    offer: 'AI-powered campaigns, done-for-you',
    excludeRoles: ['Individual Contributor']
  },
  'yc-companies': {
    name: 'YC Companies - YC Credibility',
    framework: 'F4',
    painPoints: [
      'Generic outreach',
      'Low reply rates',
      'No differentiation'
    ],
    offer: '200+ YC companies trust us',
    excludeRoles: []
  },
  'enterprise': {
    name: 'Enterprise - Domain Preservation',
    framework: 'F5',
    painPoints: [
      'Domain reputation risk',
      'Scaling concerns',
      'Brand safety'
    ],
    offer: 'Zero blacklisting guarantee',
    excludeRoles: []
  },
  'sophisticated-buyers': {
    name: 'Sophisticated Buyers - Comparison',
    framework: 'F6',
    painPoints: [
      'Evaluating AI SDRs',
      'Want transparent pricing',
      'Need full control'
    ],
    offer: 'Partner model vs autonomous AI',
    excludeRoles: []
  }
};

// PlusVibe API Helpers
async function createCampaign(name) {
  console.log(`   Creating campaign: ${name}...`);
  
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
  console.log(`   ✅ Created: ${data.id}`);
  return data;
}

async function updateCampaignWithSequences(campaignId, name, framework) {
  console.log(`   Adding sequences (${framework})...`);
  
  const seq = FRAMEWORKS[framework] || FRAMEWORKS.F1;
  
  const response = await fetch('https://api.plusvibe.ai/api/v1/campaign/update/campaign', {
    method: 'PATCH',
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspace_id: PLUSVIBE_WORKSPACE_ID,
      campaign_id: campaignId,
      camp_name: name,
      first_wait_time: 1,
      sequences: [
        {
          step: 1,
          wait_time: 1,
          variations: [
            {
              variation: 'A',
              subject: seq.subjects[0],
              name: seq.hook,
              body: generateEmailBody(seq.hook, 'first')
            }
          ]
        },
        {
          step: 2,
          wait_time: 3,
          variations: [
            {
              variation: 'A',
              subject: `Re: ${seq.subjects[0]}`,
              name: `${seq.hook} - Follow Up`,
              body: generateEmailBody(seq.hook, 'followup')
            }
          ]
        },
        {
          step: 3,
          wait_time: 5,
          variations: [
            {
              variation: 'A',
              subject: `Quick question about {{company}}`,
              name: `${seq.hook} - Final`,
              body: generateEmailBody(seq.hook, 'final')
            }
          ]
        }
      ]
    })
  });
  
  const data = await response.json();
  console.log(`   ✅ Sequences added`);
  return data;
}

async function addLeads(campaignId, leads) {
  console.log(`   Adding ${leads.length} leads...`);
  
  const response = await fetch('https://api.plusvibe.ai/api/v1/lead/add', {
    method: 'POST',
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      workspace_id: PLUSVIBE_WORKSPACE_ID,
      leads: leads.slice(0, 100) // Batch limit
    })
  });
  
  const data = await response.json();
  console.log(`   ✅ Added ${leads.length} leads`);
  return data;
}

async function activateCampaign(campaignId) {
  console.log(`   Activating...`);
  
  const response = await fetch('https://api.plusvibe.ai/api/v1/campaign/activate', {
    method: 'POST',
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      workspace_id: PLUSVIBE_WORKSPACE_ID
    })
  });
  
  console.log(`   ✅ Campaign activated`);
  return response.json();
}

// Email Body Generator
function generateEmailBody(hook, stage) {
  const bodies = {
    'Infrastructure Pain': {
      first: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>I noticed {{company}} might be dealing with email deliverability issues. Most marketing agencies burn through domains trying to scale cold outreach.</div>
<div><br></div>
<div>We guarantee 95%+ inbox placement—agencies like yours scale from 500 emails/day to 5,000 without losing a single domain.</div>
<div><br></div>
<div>Want to see how much time you could reclaim?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      followup: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Following up on my last email—did you see if infrastructure is holding back {{company}}'s outreach?</div>
<div><br></div>
<div>We just helped an agency go from 2% reply rate to 8% just by fixing their deliverability.</div>
<div><br></div>
<div>Happy to share what we did.</div>
<div><br></div>
<div>Best,<br>David</div>`,
      final: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Last try—I know inbox is busy. Quick question: is email infrastructure still a pain point for {{company}}?</div>
<div><br></div>
<div>If not, no worries. If yes, we should talk.</div>
<div><br></div>
<div>Best,<br>David</div>`
    },
    'Data Quality': {
      first: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Your team is probably wasting money on bad data. 40% of B2B email addresses decay every year—and most companies don't even know it.</div>
<div><br></div>
<div>We provide bespoke, human-verified leads. No stale databases. No burned prospects.</div>
<div><br></div>
<div>Want to see what clean data looks like?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      followup: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Following up—have you checked if {{company}}'s lead data is costing you conversions?</div>
<div><br></div>
<div>We just helped a company cut their CPL by 60% just by switching to verified data.</div>
<div><br></div>
<div>Worth exploring?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      final: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Quick question about {{company}}'s data strategy—still using purchased lists?</div>
<div><br></div>
<div>If you've got a good system, ignore this. If not, let's talk.</div>
<div><br></div>
<div>Best,<br>David</div>`
    },
    'Scale Without Hiring': {
      first: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>{{company}} shouldn't be spending hours on manual SDR work. AI can handle 90% of cold outreach—personalized, at scale.</div>
<div><br></div>
<div>We run complete outbound campaigns: infrastructure, data, AI writing, follow-ups. You just book the meetings.</div>
<div><br></div>
<div>See how it works?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      followup: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Following up on the AI outreach angle—have you explored automation for {{company}}'s sales team?</div>
<div><br></div>
<div>Companies using AI SDRs are booking 3x more meetings with 1/10th the effort.</div>
<div><br></div>
<div>Worth a conversation?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      final: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Last email—quick question: does {{company}} want to scale outreach without adding headcount?</div>
<div><br></div>
<div>If you're happy with manual, ignore. If not, let's chat.</div>
<div><br></div>
<div>Best,<br>David</div>`
    },
    'Domain Preservation': {
      first: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>One bad campaign can blacklist {{company}}'s domain for months. Most companies discover this after it's too late.</div>
<div><br></div>
<div>We use Microsoft IP rotation + aged domains. Zero blacklisting incidents in 24 months.</div>
<div><br></div>
<div>Want a domain risk audit?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      followup: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Did you see the domain risk assessment? {{company}}'s sender reputation is too valuable to gamble.</div>
<div><br></div>
<div>We can show you exactly how protected you'd be.</div>
<div><br></div>
<div>Best,<br>David</div>`,
      final: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>One last thought—is email infrastructure keeping {{company}} up at night?</div>
<div><br></div>
<div>If it's not a priority, no worries. If it is, let's talk.</div>
<div><br></div>
<div>Best,<br>David</div>`
    },
    'Comparison': {
      first: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>You're probably evaluating AI SDRs. 11x.ai: autonomous but black-box. Us: partner model. You own strategy; we handle execution.</div>
<div><br></div>
<div>Same AI capabilities. Transparent pricing. Full control. And we fix infrastructure first—because AI can't fix deliverability.</div>
<div><br></div>
<div>Compare us side-by-side?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      followup: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Following up on the AI SDR comparison—any thoughts after looking at your options?</div>
<div><br></div>
<div>We're happy to do a side-by-side with whatever else you're considering.</div>
<div><br></div>
<div>Best,<br>David</div>`,
      final: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Final email on this—worth 10 minutes to compare approaches?</div>
<div><br></div>
<div>If you've already picked a solution, ignore. If still deciding, let's talk.</div>
<div><br></div>
<div>Best,<br>David</div>`
    },
    'YC Credibility': {
      first: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>200+ YC-backed companies trust us with their email outreach. Here's what we learned.</div>
<div><br></div>
<div>Companies like {{company}} are scaling from 500 to 5,000 emails/day with 8%+ reply rates.</div>
<div><br></div>
<div>Want the playbook?</div>
<div><br></div>
<div>Best,<br>David</div>`,
      followup: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Did you see what works in cold outreach (2025 edition)?</div>
<div><br></div>
<div>We just helped another YC company double their reply rate.</div>
<div><br></div>
<div>Happy to share.</div>
<div><br></div>
<div>Best,<br>David</div>`,
      final: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Last try—quick question: is {{company}} looking to improve outreach performance?</div>
<div><br></div>
<div>If now isn't the time, no worries.</div>
<div><br></div>
<div>Best,<br>David</div>`
    }
  };
  
  return bodies[hook]?.[stage] || bodies['Infrastructure Pain'].first;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test-mode');
  const icp = args.find(a => a.startsWith('--icp='))?.split('=')[1] || 'marketing-agencies';
  
  console.log('='.repeat(60));
  console.log('GTM CAMPAIGN CREATOR');
  console.log('='.repeat(60));
  console.log(`ICP Template: ${icp}`);
  console.log(`Test Mode: ${testMode}`);
  console.log('');
  
  // Get ICP template
  const template = ICP_TEMPLATES[icp];
  if (!template) {
    console.log(`❌ Unknown ICP: ${icp}`);
    console.log(`Available: ${Object.keys(ICP_TEMPLATES).join(', ')}`);
    return;
  }
  
  console.log(`📋 Template: ${template.name}`);
  console.log(`   Framework: ${template.framework} - ${FRAMEWORKS[template.framework].name}`);
  console.log(`   Pain Points: ${template.painPoints.join(', ')}`);
  console.log('');
  
  if (testMode) {
    console.log('🧪 TEST MODE — Creating sample campaign only');
    const campaignName = `TEST - ${template.name} - ${new Date().toISOString().split('T')[0]}`;
    
    const result = await createCampaign(campaignName);
    if (result.id) {
      await updateCampaignWithSequences(result.id, campaignName, template.framework);
    }
    console.log('\n✅ Test campaign created! Check PlusVibe to review.');
    return;
  }
  
  // Production mode
  console.log('🚀 PRODUCTION MODE');
  console.log('');
  
  // This would normally:
  // 1. Pull fresh leads from data provider
  // 2. Enrich with LinkedIn data
  // 3. Filter by ICP and roles
  // 4. Create campaign
  // 5. Add leads
  // 6. Activate
  
  console.log('⚠️  PRODUCTION MODE requires:');
  console.log('   1. Lead data provider (Apollo.io, Clay, etc.)');
  console.log('   2. Lead enrichment pipeline');
  console.log('   3. Role filtering logic');
  console.log('');
  console.log('📝 To set up, configure:');
  console.log('   - LEAD_PROVIDER_API_KEY');
  console.log('   - Lead enrichment service');
  console.log('   - ICP scoring algorithm');
  console.log('');
  console.log('✅ Run in test mode first:');
  console.log(`   node campaign-creator.js --icp=${icp} --test-mode`);
}

main().catch(console.error);
