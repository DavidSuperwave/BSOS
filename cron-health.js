/**
 * Cron Health Monitor
 * Runs health checks every 15 minutes and triggers fixes
 */

const { runHealthCheck } = require('./health-check');
const { runTerminalDiagnostic, attemptAutoFix } = require('./run-terminal-check');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  checkInterval: 15 * 60 * 1000, // 15 minutes
  maxRetries: 3,
  retryDelay: 5000,
  lastCheckFile: path.join(__dirname, '.last-health-check')
};

/**
 * Run health check with retries
 */
async function runCheckWithRetries() {
  let lastError = null;
  
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const report = await runHealthCheck();
      return { success: true, report, attempt };
    } catch (error) {
      lastError = error;
      console.log(`[Cron Health] Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < CONFIG.maxRetries) {
        await delay(CONFIG.retryDelay);
      }
    }
  }
  
  return { success: false, error: lastError, attempt: CONFIG.maxRetries };
}

/**
 * Handle critical issues
 */
async function handleCriticalIssues(report) {
  const issues = [];
  
  if (report.services.backend.status === 'down') {
    issues.push('backend-down');
  }
  
  if (report.services.ui.status === 'down') {
    issues.push('ui-down');
  }
  
  if (report.missingEnvVars?.length > 0) {
    issues.push('missing-env');
  }
  
  for (const issue of issues) {
    console.log(`[Cron Health] Handling issue: ${issue}`);
    
    const context = {
      timestamp: report.timestamp,
      backend: report.services.backend,
      ui: report.services.ui,
      missing: report.missingEnvVars,
      canRestart: true
    };
    
    // Run terminal diagnostic
    const diagnostic = await runTerminalDiagnostic(issue, context);
    
    console.log(`[Cron Health] Diagnostic recommendations:`);
    diagnostic.recommendations.forEach(rec => console.log(`  - ${rec}`));
    
    // Attempt auto-fix for safe operations
    const fixes = await attemptAutoFix(issue, context);
    
    if (fixes.length > 0) {
      console.log(`[Cron Health] Auto-fixes attempted: ${fixes.join(', ')}`);
    }
  }
  
  return issues;
}

/**
 * Update last check timestamp
 */
function updateLastCheck() {
  fs.writeFileSync(CONFIG.lastCheckFile, new Date().toISOString());
}

/**
 * Get last check time
 */
function getLastCheckTime() {
  if (fs.existsSync(CONFIG.lastCheckFile)) {
    return fs.readFileSync(CONFIG.lastCheckFile, 'utf8');
  }
  return null;
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main cron execution
 */
async function main() {
  console.log('[Cron Health] Starting health check...');
  console.log(`[Cron Health] Last check: ${getLastCheckTime() || 'never'}`);
  
  const result = await runCheckWithRetries();
  
  if (result.success) {
    console.log(`[Cron Health] Check passed on attempt ${result.attempt}`);
    console.log(`[Cron Health] Overall status: ${result.report.overall}`);
    
    // Handle any issues found
    if (result.report.overall !== 'healthy') {
      const issues = await handleCriticalIssues(result.report);
      console.log(`[Cron Health] Issues handled: ${issues.length}`);
    }
    
    updateLastCheck();
    
    // Output status for cron system
    console.log('\n=== CRON_STATUS ===');
    console.log(JSON.stringify({
      status: 'ok',
      overall: result.report.overall,
      timestamp: result.report.timestamp,
      issues: result.report.overall !== 'healthy' ? 1 : 0
    }));
    
  } else {
    console.error('[Cron Health] Check failed after all retries');
    console.error('[Cron Health] Error:', result.error.message);
    
    console.log('\n=== CRON_STATUS ===');
    console.log(JSON.stringify({
      status: 'error',
      error: result.error.message,
      timestamp: new Date().toISOString()
    }));
    
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  main,
  runCheckWithRetries,
  handleCriticalIssues
};

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  main().catch(error => {
    console.error('[Cron Health] Fatal error:', error);
    process.exit(1);
  });
}
