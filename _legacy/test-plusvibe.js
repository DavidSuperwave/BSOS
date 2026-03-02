#!/usr/bin/env node
/**
 * Test PlusVibe Connection
 * Verifies API connectivity and lists campaigns
 */

require('dotenv').config();
const PlusVibeClient = require('./lib/plusvibe-client');

async function testPlusVibe() {
  console.log('🔍 Testing PlusVibe Connection\n');
  
  const apiKey = process.env.PLUSVIBE_API_KEY;
  const workspaceId = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
  
  if (!apiKey) {
    console.error('❌ PLUSVIBE_API_KEY not set in .env');
    process.exit(1);
  }
  
  console.log(`Workspace ID: ${workspaceId}`);
  console.log(`API Key: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}\n`);
  
  const client = new PlusVibeClient(apiKey, workspaceId);
  
  try {
    console.log('Finding working API endpoint...\n');
    const campaigns = await client.getCampaigns();
    
    console.log('\n✅ Connection successful!\n');
    console.log(`Found ${campaigns.length} campaigns:\n`);
    
    // Show first 10 campaigns
    campaigns.slice(0, 10).forEach((campaign, i) => {
      const name = campaign.name || campaign.campaign_name || 'Unnamed';
      const status = campaign.status || 'unknown';
      const sent = campaign.sent || campaign.total_sent || 0;
      const replied = campaign.replied || campaign.total_replied || 0;
      
      console.log(`${i + 1}. ${name}`);
      console.log(`   Status: ${status} | Sent: ${sent} | Replies: ${replied}`);
    });
    
    if (campaigns.length > 10) {
      console.log(`\n... and ${campaigns.length - 10} more`);
    }
    
    // Show summary stats
    const totalSent = campaigns.reduce((sum, c) => sum + (c.sent || c.total_sent || 0), 0);
    const totalReplied = campaigns.reduce((sum, c) => sum + (c.replied || c.total_replied || 0), 0);
    const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(2) : 0;
    
    console.log('\n📊 Summary:');
    console.log(`   Total Campaigns: ${campaigns.length}`);
    console.log(`   Total Sent: ${totalSent.toLocaleString()}`);
    console.log(`   Total Replies: ${totalReplied.toLocaleString()}`);
    console.log(`   Overall Reply Rate: ${replyRate}%`);
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify API key is correct');
    console.error('2. Check workspace ID');
    console.error('3. Ensure network connectivity');
    process.exit(1);
  }
}

testPlusVibe();
