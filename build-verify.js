#!/usr/bin/env node
/**
 * Build & Verification Script
 * Tests all components before deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BuildVerifier {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
  }

  log(test, status, message) {
    this.results.tests.push({ test, status, message });
    if (status === 'PASS') this.results.passed++;
    if (status === 'FAIL') this.results.failed++;
    if (status === 'WARN') this.results.warnings++;
    
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${test}: ${message}`);
  }

  async runAllTests() {
    console.log('🔨 Blitzscale OS Build Verification\n');
    console.log('='.repeat(60));
    
    await this.testEnvironment();
    await this.testCoreModules();
    await this.testIntegrations();
    await this.testDataPipeline();
    await this.testUIDependencies();
    
    console.log('\n' + '='.repeat(60));
    this.printSummary();
    
    return this.results.failed === 0;
  }

  async testEnvironment() {
    console.log('\n📋 Environment Tests\n');
    
    // Check .env file
    if (fs.existsSync('.env')) {
      this.log('ENV File', 'PASS', '.env exists');
    } else {
      this.log('ENV File', 'FAIL', '.env missing - copy from .env.example');
    }
    
    // Check required env vars
    const required = [
      'PLUSVIBE_API_KEY',
      'CLOSE_API_KEY',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ];
    
    required.forEach(varName => {
      if (process.env[varName] && !process.env[varName].includes('your_') && !process.env[varName].includes('xxx')) {
        this.log(`ENV ${varName}`, 'PASS', 'Configured');
      } else {
        this.log(`ENV ${varName}`, 'WARN', 'Missing or placeholder');
      }
    });
    
    // Check node_modules
    if (fs.existsSync('node_modules')) {
      this.log('Dependencies', 'PASS', 'node_modules exists');
    } else {
      this.log('Dependencies', 'FAIL', 'Run: npm install');
    }
  }

  async testCoreModules() {
    console.log('\n🔧 Core Module Tests\n');
    
    const modules = [
      'lib/plusvibe-client.js',
      'lib/supermemory-client.js',
      'lib/insight-surface-engine.js',
      'campaign-detector-v2.js',
      'campaign-detector-v3.js',
      'reply-monitor.js',
      'lead-alerts.js',
      'cron-scheduler.js',
      'data-sync-monitor.js',
      'integration-health.js'
    ];
    
    modules.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          require(path.join(__dirname, file));
          this.log(`Module ${file}`, 'PASS', 'Loads successfully');
        } catch (error) {
          this.log(`Module ${file}`, 'FAIL', error.message);
        }
      } else {
        this.log(`Module ${file}`, 'FAIL', 'File not found');
      }
    });
  }

  async testIntegrations() {
    console.log('\n🔌 Integration Tests\n');
    
    // Test PlusVibe
    try {
      const PlusVibeClient = require('./lib/plusvibe-client');
      const client = new PlusVibeClient();
      const campaigns = await client.getCampaigns();
      this.log('PlusVibe API', 'PASS', `${campaigns.length} campaigns accessible`);
    } catch (error) {
      this.log('PlusVibe API', 'FAIL', error.message);
    }
    
    // Test Close CRM
    try {
      const apiKey = process.env.CLOSE_API_KEY;
      if (apiKey && !apiKey.includes('your_')) {
        const response = await fetch('https://api.close.com/api/v1/me/', {
          headers: { 
            'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
          }
        });
        if (response.ok) {
          this.log('Close CRM API', 'PASS', 'Authenticated');
        } else {
          this.log('Close CRM API', 'FAIL', `HTTP ${response.status}`);
        }
      } else {
        this.log('Close CRM API', 'WARN', 'API key not configured');
      }
    } catch (error) {
      this.log('Close CRM API', 'FAIL', error.message);
    }
    
    // Test Perplexity
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (apiKey && !apiKey.includes('your_')) {
        this.log('Perplexity API', 'PASS', 'Key configured');
      } else {
        this.log('Perplexity API', 'WARN', 'Key not configured');
      }
    } catch (error) {
      this.log('Perplexity API', 'FAIL', error.message);
    }
  }

  async testDataPipeline() {
    console.log('\n📊 Data Pipeline Tests\n');
    
    // Check state files
    const stateFiles = [
      '.campaign-detector-state.json',
      '.sync-state.json',
      '.cron-pid'
    ];
    
    stateFiles.forEach(file => {
      if (fs.existsSync(file)) {
        this.log(`State ${file}`, 'PASS', 'Exists');
      } else {
        this.log(`State ${file}`, 'WARN', 'Will be created on first run');
      }
    });
    
    // Check companies directory
    if (fs.existsSync('companies')) {
      const companies = fs.readdirSync('companies').filter(f => f.endsWith('.json'));
      this.log('Companies Config', 'PASS', `${companies.length} companies configured`);
    } else {
      this.log('Companies Config', 'FAIL', 'companies/ directory missing');
    }
    
    // Check data directory
    if (fs.existsSync('data')) {
      this.log('Data Directory', 'PASS', 'Exists');
    } else {
      fs.mkdirSync('data', { recursive: true });
      this.log('Data Directory', 'PASS', 'Created');
    }
  }

  async testUIDependencies() {
    console.log('\n🎨 UI Tests\n');
    
    const uiPath = path.join(__dirname, 'ui');
    if (fs.existsSync(uiPath)) {
      this.log('UI Directory', 'PASS', 'Exists');
      
      // Check package.json
      if (fs.existsSync(path.join(uiPath, 'package.json'))) {
        this.log('UI Package.json', 'PASS', 'Exists');
      } else {
        this.log('UI Package.json', 'FAIL', 'Missing');
      }
      
      // Check src directory
      if (fs.existsSync(path.join(uiPath, 'src'))) {
        this.log('UI Source', 'PASS', 'src/ exists');
      } else {
        this.log('UI Source', 'FAIL', 'src/ missing');
      }
    } else {
      this.log('UI Directory', 'FAIL', 'ui/ missing');
    }
  }

  printSummary() {
    console.log('\n📊 BUILD SUMMARY\n');
    console.log(`Total Tests: ${this.results.tests.length}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    console.log();
    
    if (this.results.failed === 0) {
      console.log('🎉 BUILD SUCCESSFUL - Ready for deployment!');
    } else {
      console.log('⚠️  BUILD INCOMPLETE - Fix failures before deployment');
    }
    
    // Save results
    fs.writeFileSync('build-results.json', JSON.stringify(this.results, null, 2));
    console.log('\n💾 Results saved to build-results.json');
  }
}

// Run if called directly
if (require.main === module) {
  const verifier = new BuildVerifier();
  verifier.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = BuildVerifier;
