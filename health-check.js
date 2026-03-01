/**
 * Health Check Module for Blitzscale OS GTM Engine
 * Monitors backend, UI, database, and integrations
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  backendPort: process.env.BACKEND_PORT || 3000,
  uiPort: process.env.UI_PORT || 3001,
  healthLogPath: path.join(__dirname, 'health-logs.json'),
  maxLogEntries: 1000
};

/**
 * Make HTTP request and return promise
 */
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Check backend health endpoint
 */
async function checkBackendHealth() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: CONFIG.backendPort,
      path: '/health',
      method: 'GET'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.data);
      return {
        status: 'healthy',
        configured: {
          close: data.close_configured,
          telegram: data.telegram_configured
        },
        responseTime: Date.now()
      };
    }
    
    return { status: 'unhealthy', error: `Status ${response.statusCode}` };
  } catch (error) {
    return { status: 'down', error: error.message };
  }
}

/**
 * Check UI dev server
 */
async function checkUIHealth() {
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: CONFIG.uiPort,
      path: '/',
      method: 'GET'
    });
    
    return {
      status: response.statusCode === 200 ? 'healthy' : 'warning',
      statusCode: response.statusCode
    };
  } catch (error) {
    return { status: 'down', error: error.message };
  }
}

/**
 * Check webhook endpoints are registered
 */
async function checkWebhookEndpoints() {
  const endpoints = [
    { path: '/webhook/gtm-engine-replies', method: 'POST' },
    { path: '/webhook/plusvibe-interested-lead', method: 'POST' }
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    try {
      // Send OPTIONS to check if endpoint exists (won't trigger processing)
      const response = await makeRequest({
        hostname: 'localhost',
        port: CONFIG.backendPort,
        path: endpoint.path,
        method: 'OPTIONS'
      });
      
      results.push({
        endpoint: endpoint.path,
        status: response.statusCode < 500 ? 'registered' : 'error',
        statusCode: response.statusCode
      });
    } catch (error) {
      results.push({
        endpoint: endpoint.path,
        status: 'unreachable',
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Check environment configuration
 */
function checkEnvironment() {
  const required = [
    'CLOSE_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'PLUSVIBE_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];
  
  const optional = [
    'OPENAI_API_KEY',
    'SUPERMEMORY_API_KEY'
  ];
  
  return {
    required: required.map(key => ({
      key,
      configured: !!process.env[key]
    })),
    optional: optional.map(key => ({
      key,
      configured: !!process.env[key]
    }))
  };
}

/**
 * Run complete health check
 */
async function runHealthCheck() {
  const timestamp = new Date().toISOString();
  
  console.log(`[Health Check] Starting at ${timestamp}`);
  
  const [backend, ui, webhooks, env] = await Promise.all([
    checkBackendHealth(),
    checkUIHealth(),
    checkWebhookEndpoints(),
    checkEnvironment()
  ]);
  
  const report = {
    timestamp,
    overall: 'healthy',
    services: {
      backend,
      ui,
      webhooks
    },
    environment: env
  };
  
  // Determine overall status
  if (backend.status === 'down' || ui.status === 'down') {
    report.overall = 'critical';
  } else if (backend.status !== 'healthy' || ui.status !== 'healthy') {
    report.overall = 'degraded';
  }
  
  // Check for missing critical env vars
  const missingRequired = env.required.filter(e => !e.configured);
  if (missingRequired.length > 0) {
    report.overall = report.overall === 'healthy' ? 'warning' : report.overall;
    report.missingEnvVars = missingRequired.map(e => e.key);
  }
  
  return report;
}

/**
 * Log health check to file
 */
function logHealthCheck(report) {
  let logs = [];
  
  if (fs.existsSync(CONFIG.healthLogPath)) {
    try {
      const data = fs.readFileSync(CONFIG.healthLogPath, 'utf8');
      logs = JSON.parse(data);
    } catch (e) {
      logs = [];
    }
  }
  
  logs.push(report);
  
  // Keep only last N entries
  if (logs.length > CONFIG.maxLogEntries) {
    logs = logs.slice(-CONFIG.maxLogEntries);
  }
  
  fs.writeFileSync(CONFIG.healthLogPath, JSON.stringify(logs, null, 2));
}

/**
 * Send Telegram alert
 */
async function sendTelegramAlert(report) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '1244663682';
  
  if (!token) return;
  
  const fetch = require('node-fetch');
  
  let message = '';
  
  if (report.overall === 'critical') {
    message = `🚨 <b>CRITICAL: GTM Engine Down</b>

Backend: ${report.services.backend.status}
UI: ${report.services.ui.status}
Time: ${report.timestamp}

Immediate attention required!`;
  } else if (report.overall === 'degraded') {
    message = `⚠️ <b>DEGRADED: GTM Engine Issues</b>

Backend: ${report.services.backend.status}
UI: ${report.services.ui.status}
Time: ${report.timestamp}

Check health logs for details.`;
  } else if (report.missingEnvVars?.length > 0) {
    message = `⚠️ <b>Missing Configuration</b>

Missing: ${report.missingEnvVars.join(', ')}
Time: ${report.timestamp}

Some features may not work.`;
  }
  
  if (message) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (error) {
      console.error('[Health Check] Failed to send Telegram alert:', error.message);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const report = await runHealthCheck();
  
  logHealthCheck(report);
  
  console.log(`[Health Check] Status: ${report.overall}`);
  console.log('[Health Check] Backend:', report.services.backend.status);
  console.log('[Health Check] UI:', report.services.ui.status);
  
  if (report.missingEnvVars) {
    console.log('[Health Check] Missing env vars:', report.missingEnvVars.join(', '));
  }
  
  // Send alerts if needed
  await sendTelegramAlert(report);
  
  // Output report as JSON for cron system
  console.log('\n=== HEALTH_REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  
  // Exit with error code if critical
  if (report.overall === 'critical') {
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  runHealthCheck,
  checkBackendHealth,
  checkUIHealth,
  checkWebhookEndpoints,
  checkEnvironment
};

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  main().catch(console.error);
}
