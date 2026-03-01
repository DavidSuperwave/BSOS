/**
 * Campaign Detector v3.0 - Supermemory Max Integration
 * 
 * Uses full tagging strategy:
 * - Rich metadata schemas
 * - Auto-tagging
 * - Entity contexts
 * - Insight surfacing
 */

require('dotenv').config();
const { storeCampaign, queryInsights } = require('./lib/supermemory-client');
const { InsightSurfaceEngine } = require('./lib/insight-surface-engine');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1244663682';
const COMPANY_SLUG = process.env.COMPANY_SLUG || 'superwave';
const STATE_FILE = path.join(__dirname, '.campaign-detector-state.json');

// Known industries and roles
const KNOWN_INDUSTRIES = ['Staffing', 'SaaS', 'MSP', 'Fintech', 'Healthcare', 'Sales Outsourcing', 'Legal', 'Professional Services'];
const KNOWN_ROLES = ['VP of Sales', 'Director of Sales', 'Director of BD', 'CEO', 'Founder', 'Head of Growth'];

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { knownCampaigns: {}, lastCheck: null };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {}
}

async function getCampaigns() {
  if (!PLUSVIBE_API_KEY) return [];
  
  try {
    const response = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}`,
      { headers: { 'x-api-key': PLUSVIBE_API_KEY } }
    );
    const data = await response.json();
    return Array.isArray(data) ? data : data.data || [];
  } catch (error) {
    console.error('Error fetching campaigns:', error.message);
    return [];
  }
}

function extractICPInfo(campaignName) {
  // Standard pattern: "Industry - Role - Date"
  const standardMatch = campaignName.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d{4}-\d{2}-\d{2})$/);
  if (standardMatch) {
    return {
      industry: standardMatch[1].trim(),
      persona: standardMatch[2].trim(),
      date: standardMatch[3],
      naming_pattern: 'standard',
      is_cooked: false,
      cooked_confidence: 0
    };
  }

  // Extract industry
  let industry = 'Unknown';
  for (const ind of KNOWN_INDUSTRIES) {
    if (campaignName.toLowerCase().includes(ind.toLowerCase())) {
      industry = ind;
      break;
    }
  }

  // Extract role
  let persona = 'Unknown';
  for (const role of KNOWN_ROLES) {
    if (campaignName.toLowerCase().includes(role.toLowerCase())) {
      persona = role;
      break;
    }
  }

  // Detect "cooked" (user-created)
  const cookedSignals = [
    campaignName.includes('_'),
    campaignName.length > 60,
    !campaignName.includes('-'),
    /test|temp|draft|copy/i.test(campaignName)
  ];
  
  const cookedScore = cookedSignals.filter(Boolean).length;
  
  return {
    industry,
    persona,
    date: new Date().toISOString().split('T')[0],
    naming_pattern: cookedScore >= 2 ? 'manual_user_created' : 'partial_match',
    is_cooked: cookedScore >= 2,
    cooked_confidence: cookedScore / cookedSignals.length,
    requires_review: industry === 'Unknown' || persona === 'Unknown'
  };
}

async function detectAndStore(campaign) {
  console.log(`\n📌 Processing: ${campaign.camp_name}`);
  
  const icpInfo = extractICPInfo(campaign.camp_name);
  
  console.log(`   Industry: ${icpInfo.industry}`);
  console.log(`   Persona: ${icpInfo.persona}`);
  console.log(`   Pattern: ${icpInfo.naming_pattern}`);
  console.log(`   Cooked: ${icpInfo.is_cooked ? '👨‍🍳 Yes' : 'No'}`);
  
  // Build campaign data with full metadata
  const campaignData = {
    campaign_id: campaign.id,
    campaign_name: campaign.camp_name,
    campaign_slug: campaign.camp_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    industry: icpInfo.industry,
    persona: icpInfo.persona,
    tier: 'Fuel', // Default, could be extracted from campaign data
    framework: 'custom', // Default
    status: campaign.status,
    naming_pattern: icpInfo.naming_pattern,
    is_cooked: icpInfo.is_cooked,
    cooked_confidence: icpInfo.cooked_confidence,
    requires_review: icpInfo.requires_review,
    metrics: {
      lead_count: campaign.lead_count || 0,
      sent_count: campaign.sent_count || 0,
      reply_count: campaign.reply_count || 0,
      positive_count: campaign.positive_count || 0,
      reply_rate: campaign.sent_count ? ((campaign.reply_count || 0) / campaign.sent_count * 100) : 0,
      positive_rate: campaign.reply_count ? ((campaign.positive_count || 0) / campaign.reply_count * 100) : 0
    },
    created_at: campaign.timestamp_created || new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    related_documents: {
      replies: [],
      insights: [],
      research: []
    }
  };
  
  // Store in Supermemory with full tagging
  try {
    const result = await storeCampaign(campaignData, COMPANY_SLUG);
    console.log(`   ✅ Stored to Supermemory: ${result.id || 'success'}`);
    return result;
  } catch (error) {
    console.error(`   ❌ Failed to store: ${error.message}`);
    throw error;
  }
}

async function surfaceInsights(campaign) {
  const engine = new InsightSurfaceEngine(COMPANY_SLUG);
  const icpInfo = extractICPInfo(campaign.camp_name);
  
  console.log('\n🔍 Surfacing insights...');
  
  const insights = await engine.getInsightsForCampaignCreation(
    icpInfo.industry,
    icpInfo.persona,
    'Fuel'
  );
  
  console.log(engine.formatInsightsForDisplay(insights));
  
  return insights;
}

async function sendAlert(campaign, icpInfo, insights) {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  let message = `🆕 <b>New Campaign Detected</b>\n\n`;
  message += `📌 <b>${campaign.camp_name}</b>\n`;
  message += `├ Industry: ${icpInfo.industry}\n`;
  message += `├ Persona: ${icpInfo.persona}\n`;
  message += `├ Status: ${campaign.status}\n`;
  message += `├ Leads: ${campaign.lead_count || 0}\n`;
  
  if (icpInfo.is_cooked) {
    message += `├ 👨‍🍳 <i>Cooked Angle (${(icpInfo.cooked_confidence * 100).toFixed(0)}% confidence)</i>\n`;
  }
  
  if (icpInfo.requires_review) {
    message += `⚠️ <i>ICP Unknown - Classification Needed</i>\n`;
  }
  
  // Add insight summary
  if (insights.recommendedAngles?.length > 0) {
    message += `\n🎯 <b>Recommended Angles:</b>\n`;
    insights.recommendedAngles.slice(0, 2).forEach((angle, i) => {
      const m = angle.metadata;
      message += `${i + 1}. ${m.subject_value}: ${m.metric_value}% reply rate\n`;
    });
  }
  
  if (insights.warnings?.length > 0) {
    message += `\n⚠️ <b>Watch Out:</b>\n`;
    insights.warnings.slice(0, 2).forEach(warning => {
      message += `• ${warning.metadata?.subject_value}\n`;
    });
  }
  
  message += `\n<a href="https://plusvibe.ai">View in PlusVibe</a>`;
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
    });
    console.log('   ✅ Telegram alert sent');
  } catch (error) {
    console.error('   ❌ Telegram failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Campaign Detector v3.0 - Supermemory Max');
  console.log('============================================\n');
  
  const campaigns = await getCampaigns();
  const state = loadState();
  
  console.log(`Total campaigns in PlusVibe: ${campaigns.length}`);
  
  // Find new campaigns
  const newCampaigns = campaigns.filter(c => !state.knownCampaigns[c.id]);
  
  if (newCampaigns.length === 0) {
    console.log('\n✅ No new campaigns detected');
  } else {
    console.log(`\n🆕 New campaigns: ${newCampaigns.length}\n`);
    
    for (const campaign of newCampaigns) {
      try {
        // Store with full tagging
        await detectAndStore(campaign);
        
        // Surface insights
        const icpInfo = extractICPInfo(campaign.camp_name);
        const insights = await surfaceInsights(campaign);
        
        // Send alert
        await sendAlert(campaign, icpInfo, insights);
        
        // Add to known campaigns
        state.knownCampaigns[campaign.id] = {
          name: campaign.camp_name,
          status: campaign.status,
          detectedAt: new Date().toISOString()
        };
        
      } catch (error) {
        console.error(`   Failed to process: ${error.message}`);
      }
      
      // Small delay between campaigns
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Update state
  state.lastCheck = new Date().toISOString();
  saveState(state);
  
  console.log('\n============================================');
  console.log('✅ Campaign detection complete');
}

main().catch(console.error);
