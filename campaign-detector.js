/**
 * Campaign Detector with Supermemory Auto-Store
 *
 * Detects new PlusVibe campaigns and stores in Supermemory
 * with proper tagging for multi-company organization
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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1244663682';
const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const COMPANY_SLUG = process.env.COMPANY_SLUG || 'superwave';
const STATE_FILE = path.join(__dirname, '.campaign-detector-state.json');

// Load state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return { knownCampaigns: {}, lastCheck: null };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('State save error:', e); }
}

// Get campaigns from PlusVibe
async function getCampaigns() {
  if (!PLUSVIBE_API_KEY) {
    console.log('   PlusVibe API key not configured');
    return [];
  }
  
  try {
    const response = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}`,
      { headers: { 'x-api-key': PLUSVIBE_API_KEY } }
    );
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    return [];
  } catch (error) {
    console.error('   Error fetching campaigns:', error.message);
    return [];
  }
}

// Extract ICP info from campaign name
function extractICPInfo(campaignName) {
  if (!campaignName) {
    return { industry: 'Unknown', targetRole: 'Unknown', date: new Date().toISOString().split('T')[0] };
  }
  const match = campaignName.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    return { industry: match[1].trim(), targetRole: match[2].trim(), date: match[3] };
  }
  const industries = ['Staffing', 'SaaS', 'MSP', 'Fintech', 'Healthcare', 'E-commerce', 'Marketing Agency', 'Sales Outsourcing'];
  for (const ind of industries) {
    if (campaignName.includes(ind)) {
      return { industry: ind, targetRole: 'Unknown', date: new Date().toISOString().split('T')[0] };
    }
  }
  return { industry: 'Unknown', targetRole: 'Unknown', date: new Date().toISOString().split('T')[0] };
}

// Store campaign in Supermemory
async function storeInSupermemory(campaign) {
  if (!SUPERMEMORY_API_KEY) {
    console.log('   Supermemory not configured');
    return;
  }
  
  const icpInfo = extractICPInfo(campaign.name || campaign.camp_name);
  const content = `
Campaign: ${campaign.name || campaign.camp_name}
Status: ${campaign.status}
Industry: ${icpInfo.industry}
Target Role: ${icpInfo.targetRole}
Created: ${campaign.timestamp_created || campaign.created_at}
Campaign ID: ${campaign.id}
---
Source: PlusVibe API
Company: ${COMPANY_SLUG}
Container Tag: company:${COMPANY_SLUG}
Tags: company:${COMPANY_SLUG}, campaign:${campaign.status}, industry:${icpInfo.industry}, target:${icpInfo.targetRole}
  `.trim();
  
  try {
    await fetch('https://api.supermemory.ai/v3/documents', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        containerTag: `company:${COMPANY_SLUG}`,
        metadata: {
          type: 'campaign',
          campaignId: campaign.id,
          campaignName: campaign.camp_name,
          status: campaign.status,
          industry: icpInfo.industry,
          targetRole: icpInfo.targetRole,
          company: COMPANY_SLUG,
          tags: [COMPANY_SLUG, campaign.status, icpInfo.industry, icpInfo.targetRole].join(',')
        }
      })
    });
    console.log(`   📦 Stored: ${campaign.camp_name}`);
  } catch (error) {
    console.error('   Supermemory store error:', error.message);
  }
}

// Detect new campaigns
function detectNewCampaigns(campaigns, knownCampaigns) {
  const newCampaigns = [];
  campaigns.forEach(campaign => {
    if (!knownCampaigns[campaign.id]) {
      newCampaigns.push({ id: campaign.id, name: campaign.camp_name, status: campaign.status, createdAt: campaign.timestamp_created, isNew: true });
    } else if (knownCampaigns[campaign.id].status !== campaign.status) {
      newCampaigns.push({ id: campaign.id, name: campaign.camp_name, oldStatus: knownCampaigns[campaign.id].status, newStatus: campaign.status, statusChanged: true });
    }
  });
  return newCampaigns;
}

// Send Telegram alert
async function sendAlert(newCampaigns) {
  if (!TELEGRAM_BOT_TOKEN || newCampaigns.length === 0) return;
  
  let message = `🆕 <b>Campaign Detected</b>\n\n`;
  newCampaigns.forEach(campaign => {
    const icp = extractICPInfo(campaign.name);
    if (campaign.isNew) {
      message += `📌 <b>${campaign.name}</b>\n`;
      message += `Industry: ${icp.industry} | Target: ${icp.targetRole}\n`;
      message += `Status: ${campaign.status}\n\n`;
    } else if (campaign.statusChanged) {
      message += `🔄 ${campaign.oldStatus} → ${campaign.newStatus}\n`;
      message += `${campaign.name}\n\n`;
    }
  });
  message += `<a href="https://plusvibe.ai">View in PlusVibe</a>`;
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
    });
    console.log('   ✅ Alert sent');
  } catch (error) {
    console.error('   ❌ Alert failed:', error.message);
  }
}

// Main
async function main() {
  console.log('[Campaign Detector] Checking for new campaigns...');
  const campaigns = await getCampaigns();
  const state = loadState();
  
  console.log(`   Total campaigns: ${campaigns.length}`);
  const newCampaigns = detectNewCampaigns(campaigns, state.knownCampaigns);
  
  if (newCampaigns.length > 0) {
    console.log(`   New/changed: ${newCampaigns.length}`);
    for (const campaign of newCampaigns) {
      if (campaign.isNew) await storeInSupermemory(campaign);
    }
    await sendAlert(newCampaigns);
  } else {
    console.log('   No changes detected');
  }
  
  const knownCampaigns = {};
  campaigns.forEach(campaign => { knownCampaigns[campaign.id] = { status: campaign.status, name: campaign.camp_name }; });
  state.knownCampaigns = knownCampaigns;
  state.lastCheck = new Date().toISOString();
  saveState(state);
  console.log('[Campaign Detector] Complete');
}

main().catch(console.error);
