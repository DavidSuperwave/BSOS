#!/usr/bin/env node
/**
 * Integration Health Check
 * Tests all Blitzscale OS integrations
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

class IntegrationHealthCheck {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      overall: 'unknown',
      integrations: {}
    };
  }

  async runAllChecks() {
    console.log('🔍 Blitzscale OS Integration Health Check\n');
    
    await this.checkPlusVibe();
    await this.checkCloseCRM();
    await this.checkSupermemory();
    await this.checkPerplexity();
    await this.checkCalendly();
    await this.checkTelegram();
    await this.checkCronScheduler();
    
    // Calculate overall status
    const allHealthy = Object.values(this.results.integrations)
      .every(i => i.status === 'healthy');
    this.results.overall = allHealthy ? 'healthy' : 'degraded';
    
    this.saveResults();
    this.printSummary();
    
    return this.results;
  }

  async checkPlusVibe() {
    console.log('📧 Testing PlusVibe...');
    try {
      const PlusVibeClient = require('./lib/plusvibe-client');
      const client = new PlusVibeClient();
      
      const result = await client.healthCheck();
      
      if (result.status === 'healthy') {
        this.results.integrations.plusvibe = {
          status: 'healthy',
          campaigns: result.campaigns,
          endpoint: result.endpoint,
          lastCheck: new Date().toISOString()
        };
        console.log('   ✅ PlusVibe connected');
        console.log(`   📊 ${result.campaigns} campaigns found`);
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      this.results.integrations.plusvibe = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ PlusVibe error:', error.message);
    }
    console.log();
  }

  async checkCloseCRM() {
    console.log('🎯 Testing Close CRM...');
    try {
      const apiKey = process.env.CLOSE_API_KEY;
      
      if (!apiKey || apiKey === 'api_your_key_here') {
        throw new Error('API key not configured');
      }
      
      const response = await fetch('https://api.close.com/api/v1/me/', {
        headers: { 
          'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
        }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      this.results.integrations.close = {
        status: 'healthy',
        user: data.email,
        lastCheck: new Date().toISOString()
      };
      console.log('   ✅ Close CRM connected');
      console.log(`   👤 ${data.email}`);
      
    } catch (error) {
      this.results.integrations.close = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ Close CRM error:', error.message);
    }
    console.log();
  }

  async checkSupermemory() {
    console.log('🧠 Testing Supermemory...');
    try {
      const apiKey = process.env.SUPERMEMORY_API_KEY;
      
      if (!apiKey || apiKey === 'your_supermemory_api_key') {
        throw new Error('API key not configured');
      }
      
      const response = await fetch('https://api.supermemory.ai/v1/documents', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      this.results.integrations.supermemory = {
        status: 'healthy',
        documents: data.length || 0,
        lastCheck: new Date().toISOString()
      };
      console.log('   ✅ Supermemory connected');
      console.log(`   📄 ${data.length || 0} documents stored`);
      
    } catch (error) {
      this.results.integrations.supermemory = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ Supermemory error:', error.message);
    }
    console.log();
  }

  async checkPerplexity() {
    console.log('🔬 Testing Perplexity...');
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey || apiKey === 'pplx_your_key') {
        throw new Error('API key not configured');
      }
      
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      this.results.integrations.perplexity = {
        status: 'healthy',
        lastCheck: new Date().toISOString()
      };
      console.log('   ✅ Perplexity connected');
      
    } catch (error) {
      this.results.integrations.perplexity = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ Perplexity error:', error.message);
    }
    console.log();
  }

  async checkCalendly() {
    console.log('📅 Testing Calendly...');
    try {
      const apiKey = process.env.CALENDLY_API_KEY;
      
      if (!apiKey || apiKey === 'cal_xxx') {
        throw new Error('API key not configured (placeholder detected)');
      }
      
      const response = await fetch('https://api.calendly.com/users/me', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      this.results.integrations.calendly = {
        status: 'healthy',
        user: data.resource?.name,
        lastCheck: new Date().toISOString()
      };
      console.log('   ✅ Calendly connected');
      console.log(`   👤 ${data.resource?.name}`);
      
    } catch (error) {
      this.results.integrations.calendly = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ Calendly error:', error.message);
    }
    console.log();
  }

  async checkTelegram() {
    console.log('💬 Testing Telegram...');
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (!botToken || botToken === 'your_bot_token') {
        throw new Error('Bot token not configured');
      }
      
      // Just verify the bot token format
      if (!botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        throw new Error('Invalid bot token format');
      }
      
      this.results.integrations.telegram = {
        status: 'healthy',
        chatId: chatId,
        lastCheck: new Date().toISOString()
      };
      console.log('   ✅ Telegram configured');
      console.log(`   💬 Chat ID: ${chatId}`);
      
    } catch (error) {
      this.results.integrations.telegram = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ Telegram error:', error.message);
    }
    console.log();
  }

  async checkCronScheduler() {
    console.log('⏰ Testing Cron Scheduler...');
    try {
      const pidFile = path.join(__dirname, '.cron-pid');
      
      if (!fs.existsSync(pidFile)) {
        throw new Error('Cron scheduler not running (no PID file)');
      }
      
      const pid = fs.readFileSync(pidFile, 'utf8').trim();
      
      // Check if process is running (Windows)
      try {
        process.kill(parseInt(pid), 0);
        this.results.integrations.cron = {
          status: 'healthy',
          pid: pid,
          lastCheck: new Date().toISOString()
        };
        console.log('   ✅ Cron scheduler running');
        console.log(`   🆔 PID: ${pid}`);
      } catch (e) {
        throw new Error('Cron scheduler process not found');
      }
      
    } catch (error) {
      this.results.integrations.cron = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
      console.log('   ❌ Cron error:', error.message);
    }
    console.log();
  }

  saveResults() {
    const resultsPath = path.join(__dirname, 'integration-health.json');
    fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
    console.log(`💾 Results saved to integration-health.json\n`);
  }

  printSummary() {
    console.log('═'.repeat(50));
    console.log('INTEGRATION HEALTH SUMMARY');
    console.log('═'.repeat(50));
    
    const total = Object.keys(this.results.integrations).length;
    const healthy = Object.values(this.results.integrations)
      .filter(i => i.status === 'healthy').length;
    
    console.log(`Overall: ${this.results.overall.toUpperCase()}`);
    console.log(`Healthy: ${healthy}/${total} integrations`);
    console.log();
    
    Object.entries(this.results.integrations).forEach(([name, data]) => {
      const icon = data.status === 'healthy' ? '✅' : '❌';
      console.log(`${icon} ${name.toUpperCase()}: ${data.status}`);
      if (data.error) {
        console.log(`   Error: ${data.error}`);
      }
    });
    
    console.log();
    console.log('═'.repeat(50));
    
    if (this.results.overall !== 'healthy') {
      console.log('\n⚠️  Action Required:');
      console.log('1. Check .env file for missing API keys');
      console.log('2. Run: npm run setup');
      console.log('3. Verify network connectivity');
    }
  }
}

// Run if called directly
if (require.main === module) {
  const checker = new IntegrationHealthCheck();
  checker.runAllChecks().catch(console.error);
}

module.exports = IntegrationHealthCheck;
