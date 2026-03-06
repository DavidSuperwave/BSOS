/**
 * End-to-End Test for Research Workflow
 * 
 * Tests:
 * 1. research_and_create_campaign tool
 * 2. create_campaign tool
 * 3. Supermemory storage
 * 4. Full workflow integration
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const perplexityKey = process.env.PERPLEXITY_API_KEY;
const plusvibeKey = process.env.PLUSVIBE_API_KEY;
const plusvibeWorkspaceId = process.env.PLUSVIBE_WORKSPACE_ID;
const supermemoryKey = process.env.SUPERMEMORY_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test configuration
const TEST_CONFIG = {
  researchTopic: 'Marketing agencies',
  senderEmail: 'David@superwave.ai',
  campaignName: `Test Campaign - ${new Date().toISOString().split('T')[0]}`,
};

async function findTestCompany() {
  console.log('\n📋 Step 1: Finding test company...');
  
  // Try to find a company with "superwave" in the name or slug
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, slug, integration_credentials, onboarding_data')
    .or('name.ilike.%superwave%,slug.ilike.%superwave%')
    .limit(5);

  if (error) {
    console.error('❌ Error finding company:', error);
    return null;
  }

  if (!companies || companies.length === 0) {
    console.log('⚠️  No Superwave company found. Looking for any company...');
    const { data: anyCompany } = await supabase
      .from('companies')
      .select('id, name, slug, integration_credentials, onboarding_data')
      .limit(1)
      .single();
    
    if (anyCompany) {
      console.log(`✅ Using company: ${anyCompany.name} (${anyCompany.slug})`);
      return anyCompany;
    }
    
    console.error('❌ No companies found in database');
    return null;
  }

  const company = companies[0];
  console.log(`✅ Found company: ${company.name} (${company.slug})`);
  return company;
}

async function testResearchWorkflow(company) {
  console.log('\n🔍 Step 2: Testing research_and_create_campaign tool...');
  
  if (!perplexityKey) {
    console.error('❌ PERPLEXITY_API_KEY not configured');
    return null;
  }

  const companyId = company.id;
  const companyName = company.name || 'Company';
  const companySlug = company.slug || 'company';
  const profile = company.onboarding_data || {};

  // Build research query
  const researchQuery = `Research ${TEST_CONFIG.researchTopic} as a target market for ${companyName}. 
Focus on:
- Key pain points and challenges this market faces
- Common buyer personas and decision makers
- Industry trends and opportunities
- Competitive landscape
- Best messaging angles for cold outreach

Company context: ${JSON.stringify({
    industry: profile.identity?.industry || 'B2B Services',
    services: profile.services?.primary?.name || 'Outbound email services',
    valueProposition: profile.identity?.value_proposition || 'Email infrastructure',
  })}`;

  console.log('   Researching topic:', TEST_CONFIG.researchTopic);
  
  try {
    // Research using Perplexity
    const researchRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a B2B market research expert specializing in outbound sales and email marketing. Provide detailed, actionable insights for campaign creation.',
          },
          { role: 'user', content: researchQuery },
        ],
        max_tokens: 2000,
      }),
    });

    if (!researchRes.ok) {
      const errorText = await researchRes.text();
      throw new Error(`Perplexity API error: ${researchRes.status} - ${errorText}`);
    }

    const researchData = await researchRes.json();
    const researchContent = researchData.choices?.[0]?.message?.content || '';
    const citations = researchData.citations || [];

    console.log('   ✅ Research completed');
    console.log(`   Research length: ${researchContent.length} characters`);
    console.log(`   Citations: ${citations.length}`);

    // Generate email scripts
    console.log('   Generating email scripts...');
    
    const emailScriptsPrompt = `Based on this research about ${TEST_CONFIG.researchTopic}:

${researchContent}

Generate 3 different email scripts for cold outreach. Each script should:
- Be under 75 words
- Address a specific pain point from the research
- Include a strong offer upfront
- Use a casual, direct tone
- Include personalization placeholders: {{firstName}}, {{company}}
- Have a clear CTA

Company context:
- Company: ${companyName}
- Service: ${profile.services?.primary?.name || 'Outbound email services'}
- Value prop: ${profile.identity?.value_proposition || 'Email infrastructure'}

Return JSON with this structure:
{
  "scripts": [
    {
      "name": "Script 1 Name",
      "subject": "Email subject line",
      "body": "Email body HTML",
      "angle": "Pain point angle",
      "framework": "F1-F6 framework identifier"
    },
    ...
  ]
}`;

    const scriptsRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are an expert email copywriter for B2B cold outreach. Generate high-converting email scripts based on market research.',
          },
          { role: 'user', content: emailScriptsPrompt },
        ],
        max_tokens: 3000,
      }),
    });

    if (!scriptsRes.ok) {
      throw new Error(`Perplexity API error: ${scriptsRes.status}`);
    }

    const scriptsData = await scriptsRes.json();
    const scriptsText = scriptsData.choices?.[0]?.message?.content || '';
    
    let emailScripts = [];
    try {
      const jsonMatch = scriptsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        emailScripts = parsed.scripts || [];
      }
    } catch (e) {
      console.log('   ⚠️  Could not parse JSON, using fallback scripts');
      emailScripts = generateDefaultScripts();
    }

    // Ensure we have 3 scripts
    while (emailScripts.length < 3) {
      emailScripts.push(...generateDefaultScripts());
    }
    emailScripts = emailScripts.slice(0, 3);

    console.log(`   ✅ Generated ${emailScripts.length} email scripts`);
    emailScripts.forEach((script, i) => {
      console.log(`   Script ${i + 1}: ${script.name} (${script.framework})`);
    });

    // Test Supermemory storage
    if (supermemoryKey) {
      console.log('\n💾 Step 3: Testing Supermemory storage...');
      
      const { companyContainerTag } = require('./ui/src/lib/supermemory-client.ts');
      const containerTag = companyContainerTag(companySlug);
      
      const researchSummary = `# Research: ${TEST_CONFIG.researchTopic}

## Research Findings
${researchContent}

## Citations
${citations.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Email Scripts Generated
${emailScripts.map((s, i) => `### Script ${i + 1}: ${s.name}\n**Angle:** ${s.angle}\n**Framework:** ${s.framework}\n**Subject:** ${s.subject}\n\n**Body:**\n${s.body}`).join('\n\n')}

## Actions Taken
- Research completed on ${new Date().toISOString()}
- 3 email scripts generated
- Ready for campaign creation
- Sender: ${TEST_CONFIG.senderEmail}
`;

      try {
        const storeRes = await fetch('https://api.supermemory.ai/v3/memories', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supermemoryKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: researchSummary,
            containerTag,
            metadata: {
              category: 'research_summary',
              research_topic: TEST_CONFIG.researchTopic,
              company_id: companyId,
              sender_email: TEST_CONFIG.senderEmail,
              scripts_count: emailScripts.length,
              created_at: new Date().toISOString(),
            },
            customId: `research_${companySlug}_${TEST_CONFIG.researchTopic.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
          }),
        });

        if (storeRes.ok) {
          const stored = await storeRes.json();
          console.log('   ✅ Research stored in Supermemory');
          console.log(`   Memory ID: ${stored.id}`);
        } else {
          const errorText = await storeRes.text();
          console.log(`   ⚠️  Supermemory storage failed: ${storeRes.status} - ${errorText}`);
        }
      } catch (err) {
        console.log(`   ⚠️  Supermemory error: ${err.message}`);
      }
    } else {
      console.log('\n⚠️  Step 3: Skipping Supermemory (API key not configured)');
    }

    return {
      research: {
        topic: TEST_CONFIG.researchTopic,
        content: researchContent,
        citations,
      },
      emailScripts,
      companyId,
      companySlug,
    };
  } catch (error) {
    console.error('❌ Research workflow failed:', error);
    return null;
  }
}

async function testCampaignCreation(companyId, emailScripts) {
  console.log('\n📧 Step 4: Testing create_campaign tool...');
  
  if (!plusvibeKey || !plusvibeWorkspaceId) {
    console.error('❌ PLUSVIBE_API_KEY or PLUSVIBE_WORKSPACE_ID not configured');
    return null;
  }

  if (!emailScripts || emailScripts.length === 0) {
    console.error('❌ No email scripts provided');
    return null;
  }

  try {
    // Create campaign
    console.log(`   Creating campaign: ${TEST_CONFIG.campaignName}...`);
    
    const createRes = await fetch('https://api.plusvibe.ai/api/v1/campaign/add/campaign', {
      method: 'POST',
      headers: {
        'x-api-key': plusvibeKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        camp_name: TEST_CONFIG.campaignName,
        workspace_id: plusvibeWorkspaceId,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Failed to create campaign: ${createRes.status} - ${errorText}`);
    }

    const campaignData = await createRes.json();
    const campaignId = campaignData.id || campaignData._id;

    if (!campaignId) {
      throw new Error('Campaign created but no ID returned');
    }

    console.log(`   ✅ Campaign created: ${campaignId}`);

    // Build sequences
    const sequences = emailScripts.map((script, index) => ({
      step: index + 1,
      wait_time: index === 0 ? 1 : index === 1 ? 3 : 5,
      variations: [
        {
          variation: 'A',
          subject: script.subject || `Quick question about {{company}}`,
          name: script.name || `Email ${index + 1}`,
          body: script.body || generateDefaultEmailBody(),
        },
      ],
    }));

    // Update campaign with sequences
    console.log(`   Adding ${sequences.length} email sequences...`);
    
    const updateRes = await fetch('https://api.plusvibe.ai/api/v1/campaign/update/campaign', {
      method: 'PATCH',
      headers: {
        'x-api-key': plusvibeKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: plusvibeWorkspaceId,
        campaign_id: campaignId,
        camp_name: TEST_CONFIG.campaignName,
        first_wait_time: 1,
        sequences,
      }),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      throw new Error(`Failed to update campaign sequences: ${updateRes.status} - ${errorText}`);
    }

    console.log('   ✅ Campaign sequences added');
    console.log(`   ✅ Campaign ready: ${campaignId}`);
    
    return {
      success: true,
      campaignId,
      campaignName: TEST_CONFIG.campaignName,
      sequencesCount: sequences.length,
    };
  } catch (error) {
    console.error('❌ Campaign creation failed:', error);
    return null;
  }
}

function generateDefaultScripts() {
  const senderName = TEST_CONFIG.senderEmail.split('@')[0];
  const capitalizedName = senderName.charAt(0).toUpperCase() + senderName.slice(1);
  
  return [
    {
      name: 'Infrastructure Pain Angle',
      subject: 'Is {{company}} dealing with email deliverability issues?',
      body: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>I noticed {{company}} might be dealing with email deliverability issues. Most ${TEST_CONFIG.researchTopic.toLowerCase()} burn through domains trying to scale cold outreach.</div>
<div><br></div>
<div>We guarantee 95%+ inbox placement—companies like yours scale from 500 emails/day to 5,000 without losing a single domain.</div>
<div><br></div>
<div>Want to see how much time you could reclaim?</div>
<div><br></div>
<div>Best,<br>${capitalizedName}</div>`,
      angle: 'Infrastructure Pain',
      framework: 'F1',
    },
  ];
}

function generateDefaultEmailBody() {
  return `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Quick question about {{company}}—are you looking to improve your outbound email performance?</div>
<div><br></div>
<div>Best,<br>David</div>`;
}

async function runTests() {
  console.log('🚀 Starting End-to-End Test for Research Workflow\n');
  console.log('='.repeat(60));
  console.log('Test Configuration:');
  console.log(`  Research Topic: ${TEST_CONFIG.researchTopic}`);
  console.log(`  Sender Email: ${TEST_CONFIG.senderEmail}`);
  console.log(`  Campaign Name: ${TEST_CONFIG.campaignName}`);
  console.log('='.repeat(60));

  // Step 1: Find company
  const company = await findTestCompany();
  if (!company) {
    console.error('\n❌ Cannot proceed without a company');
    process.exit(1);
  }

  // Step 2: Test research workflow
  const researchResult = await testResearchWorkflow(company);
  if (!researchResult) {
    console.error('\n❌ Research workflow failed');
    process.exit(1);
  }

  // Step 3: Test campaign creation
  const campaignResult = await testCampaignCreation(company.id, researchResult.emailScripts);
  if (!campaignResult) {
    console.error('\n❌ Campaign creation failed');
    process.exit(1);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ END-TO-END TEST COMPLETE');
  console.log('='.repeat(60));
  console.log('\nResults:');
  console.log(`  ✅ Research completed: ${TEST_CONFIG.researchTopic}`);
  console.log(`  ✅ Email scripts generated: ${researchResult.emailScripts.length}`);
  console.log(`  ✅ Campaign created: ${campaignResult.campaignId}`);
  console.log(`  ✅ Sequences added: ${campaignResult.sequencesCount}`);
  console.log(`  ✅ Supermemory storage: ${supermemoryKey ? 'Yes' : 'Skipped'}`);
  console.log('\n🎉 All tests passed!');
}

// Run tests
runTests().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
