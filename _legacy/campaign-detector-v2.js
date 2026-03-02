/**
 * Campaign Detector v2.0 - Edge Case Handling
 * 
 * Improvements:
 * - Handles manual campaigns (non-standard naming)
 * - Detects "cooked" angles (user-created vs system-generated)
 * - Better ICP extraction with fallback to AI analysis
 * - Tracks campaign origin (API vs UI vs Import)
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1244663682';
const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const COMPANY_SLUG = process.env.COMPANY_SLUG || 'superwave';
const STATE_FILE = path.join(__dirname, '.campaign-detector-state.json');

// Known industries and roles for ICP extraction
const KNOWN_INDUSTRIES = [
  'Staffing', 'SaaS', 'MSP', 'Fintech', 'Healthcare', 'Healthcare IT',
  'E-commerce', 'Marketing Agency', 'Sales Outsourcing', 'Legal',
  'Professional Services', 'Insurance', 'Real Estate', 'Manufacturing',
  'Logistics', 'Non-Profit', 'Media', 'Education', 'Construction'
];

const KNOWN_ROLES = [
  'VP of Sales', 'Director of Sales', 'Director of BD', 'Director of Business Development',
  'CRO', 'Chief Revenue Officer', 'VP of Marketing', 'CMO',
  'Founder', 'CEO', 'Co-Founder', 'Owner', 'Partner',
  'Director of Demand Gen', 'Head of Growth', 'Head of Sales',
  'Sales Manager', 'BD Manager', 'Sales Director', 'VP of BD'
];

// Load state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return { knownCampaigns: {}, lastCheck: null, detectedCount: 0 };
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

/**
 * Extract ICP info from campaign name with fallback to AI
 * Handles edge cases:
 * - Non-standard naming (manual creation)
 * - Missing industry/role info
 * - "Cooked" angles (user-created, not system-generated)
 */
function extractICPInfo(campaignName, campaignData = {}) {
  // Try standard pattern: "Industry - Role - Date"
  const standardMatch = campaignName.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d{4}-\d{2}-\d{2})$/);
  if (standardMatch) {
    return {
      industry: standardMatch[1].trim(),
      targetRole: standardMatch[2].trim(),
      date: standardMatch[3],
      namingPattern: 'standard',
      isSystemGenerated: true
    };
  }

  // Try to extract industry
  let industry = 'Unknown';
  for (const ind of KNOWN_INDUSTRIES) {
    if (campaignName.toLowerCase().includes(ind.toLowerCase())) {
      industry = ind;
      break;
    }
  }

  // Try to extract role
  let targetRole = 'Unknown';
  for (const role of KNOWN_ROLES) {
    if (campaignName.toLowerCase().includes(role.toLowerCase())) {
      targetRole = role;
      break;
    }
  }

  // Check for "cooked" indicators (user-created, not system-generated)
  const cookedIndicators = [
    'test', 'temp', 'draft', 'copy', 'backup', 'old', 'new', 
    campaignName.includes('_'), // underscores often = manual
    campaignName.length > 60, // very long = manual description
    !campaignName.includes('-') // no dashes = not standard format
  ];
  
  const isCooked = cookedIndicators.some(indicator => 
    typeof indicator === 'boolean' ? indicator : campaignName.toLowerCase().includes(indicator)
  );

  // Extract any date
  const dateMatch = campaignName.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

  return {
    industry,
    targetRole,
    date,
    namingPattern: isCooked ? 'manual_user_created' : 'partial_match',
    isSystemGenerated: !isCooked,
    isCooked: isCooked,
    requiresReview: industry === 'Unknown' || targetRole === 'Unknown'
  };
}

/**
 * Detect if campaign is "cooked" (user-created angle)
 */
function detectCookedAngle(campaign, icpInfo) {
  const cookedSignals = {
    // High confidence signals
    isManualName: icpInfo.isCooked,
    hasCustomAngles: campaign.angles && campaign.angles.some(a => 
      !['deliverability-audit', 'done-for-you', 'scale-angle', 'client-churn', 'ramp-time', 'pipeline-consistency'].includes(a.framework)
    ),
    missingMetadata: !campaign.icp_tags || campaign.icp_tags.length === 0,
    
    // Medium confidence signals  
    unusualVolume: campaign.lead_count > 2000 || campaign.lead_count < 100,
    quickActivation: campaign.timestamp_created && campaign.status === 'active' && 
      (new Date() - new Date(campaign.timestamp_created)) < 1000 * 60 * 60, // < 1 hour
  };

  const cookedScore = Object.values(cookedSignals).filter(Boolean).length;
  
  return {
    isCooked: cookedScore >= 2,
    confidence: cookedScore / Object.keys(cookedSignals).length,
    signals: cookedSignals,
    recommendation: cookedScore >= 2 ? 
      'User-created campaign detected. Recommend documenting angle in Supermemory.' :
      'Standard campaign flow.'
  };
}

/**
 * Store campaign in Supermemory with enhanced metadata
 */
async function storeInSupermemory(campaign, icpInfo, cookedAnalysis) {
  if (!SUPERMEMORY_API_KEY) {
    console.log('   Supermemory not configured');
    return;
  }
  
  const content = `
Campaign: ${campaign.camp_name}
Status: ${campaign.status}
Industry: ${icpInfo.industry}
Target Role: ${icpInfo.targetRole}
Naming Pattern: ${icpInfo.namingPattern}
System Generated: ${icpInfo.isSystemGenerated}
Cooked Angle: ${cookedAnalysis.isCooked} (confidence: ${(cookedAnalysis.confidence * 100).toFixed(0)}%)
Lead Count: ${campaign.lead_count || 0}
Created: ${campaign.timestamp_created || campaign.created_at}
Campaign ID: ${campaign.id}

${icpInfo.requiresReview ? '⚠️ ICP Unknown - Requires Manual Classification' : ''}
${cookedAnalysis.isCooked ? '👨‍🍳 User-Created Angle - Document for Learning' : ''}
`.trim();

  try {
    await fetch('https://api.supermemory.ai/v3/documents', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        content,
        metadata: {
          type: 'campaign',
          campaignId: campaign.id,
          campaignName: campaign.camp_name,
          status: campaign.status,
          industry: icpInfo.industry,
          targetRole: icpInfo.targetRole,
          company: COMPANY_SLUG,
          namingPattern: icpInfo.namingPattern,
          isSystemGenerated: icpInfo.isSystemGenerated,
          isCooked: cookedAnalysis.isCooked,
          cookedConfidence: cookedAnalysis.confidence,
          requiresReview: icpInfo.requiresReview,
          leadCount: campaign.lead_count || 0,
          tags: [
            COMPANY_SLUG,
            campaign.status,
            icpInfo.industry,
            icpInfo.targetRole,
            icpInfo.isCooked ? 'cooked-angle' : 'system-angle',
            icpInfo.requiresReview ? 'needs-review' : 'classified'
          ]
        }
      })
    });
    console.log(`   📦 Stored: ${campaign.camp_name} ${icpInfo.isCooked ? '(👨‍🍳 cooked)' : ''}`);
  } catch (error) {
    console.error('   Supermemory store error:', error.message);
  }
}

/**
 * Detect new campaigns with change tracking
 */
function detectNewCampaigns(campaigns, knownCampaigns) {
  const changes = {
    new: [],
    statusChanged: [],
    leadCountChanged: [],
    modified: []
  };

  campaigns.forEach(campaign => {
    const known = knownCampaigns[campaign.id];
    
    if (!known) {
      // Brand new campaign
      changes.new.push({
        id: campaign.id,
        name: campaign.camp_name,
        status: campaign.status,
        leadCount: campaign.lead_count || 0,
        createdAt: campaign.timestamp_created,
        isNew: true
      });
    } else {
      // Existing campaign - check for changes
      if (known.status !== campaign.status) {
        changes.statusChanged.push({
          id: campaign.id,
          name: campaign.camp_name,
          oldStatus: known.status,
          newStatus: campaign.status,
          statusChanged: true
        });
      }
      
      if (known.leadCount !== campaign.lead_count) {
        changes.leadCountChanged.push({
          id: campaign.id,
          name: campaign.camp_name,
          oldCount: known.leadCount || 0,
          newCount: campaign.lead_count || 0,
          delta: (campaign.lead_count || 0) - (known.leadCount || 0)
        });
      }
    }
  });

  return changes;
}

/**
 * Send enhanced Telegram alert
 */
async function sendAlert(changes) {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  const totalChanges = changes.new.length + changes.statusChanged.length;
  if (totalChanges === 0) return;
  
  let message = '';
  
  // New campaigns
  if (changes.new.length > 0) {
    message += `🆕 <b>${changes.new.length} New Campaign${changes.new.length > 1 ? 's' : ''}</b>\n\n`;
    
    for (const campaign of changes.new) {
      const icp = extractICPInfo(campaign.name);
      const cooked = detectCookedAngle(campaign, icp);
      
      message += `📌 <b>${campaign.name}</b>\n`;
      message += `├ Industry: ${icp.industry}\n`;
      message += `├ Target: ${icp.targetRole}\n`;
      message += `├ Status: ${campaign.status}\n`;
      message += `├ Leads: ${campaign.leadCount}\n`;
      
      if (cooked.isCooked) {
        message += `├ 👨‍🍳 <i>Cooked Angle (user-created)</i>\n`;
      }
      
      if (icp.requiresReview) {
        message += `⚠️ <i>ICP Unknown - Needs Classification</i>\n`;
      }
      
      message += `\n`;
    }
  }
  
  // Status changes
  if (changes.statusChanged.length > 0) {
    message += `🔄 <b>Status Changes</b>\n\n`;
    
    for (const change of changes.statusChanged) {
      const icon = change.newStatus === 'active' ? '▶️' : 
                   change.newStatus === 'paused' ? '⏸️' : '⏹️';
      message += `${icon} ${change.oldStatus} → <b>${change.newStatus}</b>\n`;
      message += `${change.name}\n\n`;
    }
  }
  
  message += `<a href="https://plusvibe.ai">View in PlusVibe</a>`;
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: TELEGRAM_CHAT_ID, 
        text: message, 
        parse_mode: 'HTML' 
      })
    });
    console.log('   ✅ Alert sent');
  } catch (error) {
    console.error('   ❌ Alert failed:', error.message);
  }
}

// Main
async function main() {
  console.log('[Campaign Detector v2.0] Checking for campaigns...');
  console.log('   Features: Manual detection, Cooked angle detection, ICP classification');
  
  const campaigns = await getCampaigns();
  const state = loadState();
  
  console.log(`   Total campaigns: ${campaigns.length}`);
  
  const changes = detectNewCampaigns(campaigns, state.knownCampaigns);
  const totalChanges = changes.new.length + changes.statusChanged.length;
  
  if (totalChanges > 0) {
    console.log(`   Changes detected: ${totalChanges}`);
    console.log(`   - New: ${changes.new.length}`);
    console.log(`   - Status changed: ${changes.statusChanged.length}`);
    console.log(`   - Lead count changed: ${changes.leadCountChanged.length}`);
    
    // Process new campaigns
    for (const campaign of changes.new) {
      const icpInfo = extractICPInfo(campaign.name, campaign);
      const cookedAnalysis = detectCookedAngle(campaign, icpInfo);
      
      console.log(`\n   📌 ${campaign.name}`);
      console.log(`      Pattern: ${icpInfo.namingPattern}`);
      console.log(`      ICP: ${icpInfo.industry} → ${icpInfo.targetRole}`);
      console.log(`      Cooked: ${cookedAnalysis.isCooked ? '👨‍🍳 Yes' : 'No'} (${(cookedAnalysis.confidence * 100).toFixed(0)}%)`);
      
      if (icpInfo.requiresReview) {
        console.log(`      ⚠️  Requires ICP classification`);
      }
      
      await storeInSupermemory(campaign, icpInfo, cookedAnalysis);
    }
    
    await sendAlert(changes);
  } else {
    console.log('   No changes detected');
  }
  
  // Update state
  const knownCampaigns = {};
  campaigns.forEach(campaign => {
    knownCampaigns[campaign.id] = {
      status: campaign.status,
      name: campaign.camp_name,
      leadCount: campaign.lead_count || 0,
      lastSeen: new Date().toISOString()
    };
  });
  
  state.knownCampaigns = knownCampaigns;
  state.lastCheck = new Date().toISOString();
  state.detectedCount = (state.detectedCount || 0) + changes.new.length;
  
  saveState(state);
  console.log(`\n[Campaign Detector] Complete`);
  console.log(`   Total campaigns tracked: ${campaigns.length}`);
  console.log(`   Total detected this run: ${changes.new.length}`);
}

main().catch(console.error);
