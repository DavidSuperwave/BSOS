#!/usr/bin/env node
/**
 * Data Sync Monitor
 * Ensures campaign data is continuously gathered as emails are sent
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

class DataSyncMonitor {
  constructor() {
    this.stateFile = path.join(__dirname, '.sync-state.json');
    this.state = this.loadState();
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (e) {}
    return {
      lastSync: null,
      campaigns: {},
      metrics: {},
      errors: []
    };
  }

  saveState() {
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  async syncCampaigns() {
    console.log('🔄 Syncing campaign data...');
    
    try {
      const campaigns = await this.fetchPlusVibeCampaigns();
      
      let newData = 0;
      let updated = 0;
      
      for (const campaign of campaigns) {
        const existing = this.state.campaigns[campaign.id];
        
        if (!existing) {
          // New campaign
          this.state.campaigns[campaign.id] = {
            ...campaign,
            firstSeen: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };
          newData++;
          
          // Log to Supermemory
          await this.logCampaignToSupermemory(campaign);
          
        } else if (this.hasChanges(existing, campaign)) {
          // Updated campaign
          this.state.campaigns[campaign.id] = {
            ...existing,
            ...campaign,
            lastUpdated: new Date().toISOString()
          };
          updated++;
          
          // Log metrics change
          await this.logMetricsChange(existing, campaign);
        }
      }
      
      this.state.lastSync = new Date().toISOString();
      this.saveState();
      
      console.log(`   ✅ Sync complete`);
      console.log(`   📊 ${campaigns.length} total campaigns`);
      console.log(`   🆕 ${newData} new`);
      console.log(`   📝 ${updated} updated`);
      
      return { campaigns: campaigns.length, new: newData, updated };
      
    } catch (error) {
      console.error('   ❌ Sync failed:', error.message);
      this.state.errors.push({
        time: new Date().toISOString(),
        error: error.message
      });
      this.saveState();
      throw error;
    }
  }

  async fetchPlusVibeCampaigns() {
    const apiKey = process.env.PLUSVIBE_API_KEY;
    const workspaceId = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
    
    if (!apiKey) {
      throw new Error('PlusVibe API key not configured');
    }
    
    const response = await fetch(
      `https://api.plusvibe.com/v1/workspaces/${workspaceId}/campaigns`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      }
    );
    
    if (!response.ok) {
      throw new Error(`PlusVibe API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  }

  hasChanges(existing, current) {
    const metricsToCheck = ['sent', 'delivered', 'replied', 'opened', 'bounced'];
    return metricsToCheck.some(m => existing[m] !== current[m]);
  }

  async logCampaignToSupermemory(campaign) {
    try {
      const { SupermemoryClient } = require('./lib/supermemory-client');
      const client = new SupermemoryClient();
      
      await client.addCampaign({
        campaignId: campaign.id,
        name: campaign.name,
        industry: campaign.industry || 'Unknown',
        target: campaign.target || 'Unknown',
        tier: campaign.tier || 'Unknown',
        metrics: {
          sent: campaign.sent || 0,
          delivered: campaign.delivered || 0,
          replied: campaign.replied || 0,
          opened: campaign.opened || 0,
          bounced: campaign.bounced || 0
        },
        status: campaign.status
      });
      
      console.log(`   🧠 Logged to Supermemory: ${campaign.name}`);
    } catch (error) {
      console.log(`   ⚠️  Failed to log to Supermemory: ${error.message}`);
    }
  }

  async logMetricsChange(existing, current) {
    const changes = [];
    const metrics = ['sent', 'delivered', 'replied', 'opened', 'bounced'];
    
    metrics.forEach(m => {
      if (existing[m] !== current[m]) {
        changes.push(`${m}: ${existing[m]} → ${current[m]}`);
      }
    });
    
    if (changes.length > 0) {
      console.log(`   📈 ${current.name}: ${changes.join(', ')}`);
      
      // Check for significant events
      if (current.replied > existing.replied) {
        await this.notifyNewReplies(current, current.replied - existing.replied);
      }
    }
  }

  async notifyNewReplies(campaign, count) {
    const message = `📧 ${campaign.name}: ${count} new reply${count > 1 ? 'ies' : 'y'}`;
    console.log(`   🔔 ${message}`);
    
    // Send Telegram notification
    try {
      const TelegramBot = require('./lib/telegram-bot');
      const bot = new TelegramBot();
      await bot.send(message);
    } catch (e) {
      // Silent fail - not critical
    }
  }

  async syncReplies() {
    console.log('💬 Syncing reply data...');
    
    try {
      const { syncAllReplies } = require('./reply-monitor');
      const result = await syncAllReplies();
      
      if (result.replies > 0) {
        console.log(`   ✅ Synced ${result.replies} replies`);
        console.log(`   🎯 ${result.positive} positive`);
        console.log(`   👎 ${result.negative} negative`);
      } else {
        console.log(`   ℹ️  No new replies`);
      }
      
      return result;
      
    } catch (error) {
      console.error('   ❌ Reply sync failed:', error.message);
      throw error;
    }
  }

  async runFullSync() {
    console.log('\n' + '='.repeat(50));
    console.log('DATA SYNC STARTED');
    console.log('='.repeat(50) + '\n');
    
    const startTime = Date.now();
    
    try {
      // 1. Sync campaign metrics
      const campaignResult = await this.syncCampaigns();
      console.log();
      
      // 2. Sync replies
      const replyResult = await this.syncReplies();
      console.log();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log('='.repeat(50));
      console.log('DATA SYNC COMPLETE');
      console.log('='.repeat(50));
      console.log(`⏱️  Duration: ${duration}s`);
      console.log(`📊 Campaigns: ${campaignResult.campaigns}`);
      console.log(`💬 Replies: ${replyResult.replies || 0}`);
      console.log();
      
      return {
        success: true,
        campaigns: campaignResult,
        replies: replyResult,
        duration: parseFloat(duration)
      };
      
    } catch (error) {
      console.error('\n❌ Full sync failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  startContinuousSync() {
    console.log(`🔄 Starting continuous sync (every ${this.syncInterval / 60000} minutes)`);
    
    // Run immediately
    this.runFullSync();
    
    // Then schedule
    setInterval(() => {
      this.runFullSync();
    }, this.syncInterval);
    
    // Also sync on signals
    process.on('SIGUSR1', () => {
      console.log('📡 Received sync signal');
      this.runFullSync();
    });
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new DataSyncMonitor();
  
  const mode = process.argv[2];
  
  if (mode === '--continuous' || mode === '-c') {
    monitor.startContinuousSync();
  } else {
    monitor.runFullSync().then(result => {
      process.exit(result.success ? 0 : 1);
    });
  }
}

module.exports = DataSyncMonitor;
