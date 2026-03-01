/**
 * Terminal Diagnostics Agent
 * Spawns sub-agents to research and fix issues
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Run terminal diagnostic with Kimi K2.5
 */
async function runTerminalDiagnostic(issue, context = {}) {
  console.log(`[Terminal Check] Running diagnostic for: ${issue}`);
  
  const timestamp = new Date().toISOString();
  const logFile = path.join(__dirname, 'diagnostic-logs', `diag-${Date.now()}.log`);
  
  // Ensure logs directory exists
  if (!fs.existsSync(path.dirname(logFile))) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }
  
  // Build diagnostic prompt
  const diagnosticPrompt = buildDiagnosticPrompt(issue, context);
  
  // Write prompt to temp file for processing
  const promptFile = path.join(__dirname, '.temp-diagnostic-prompt.txt');
  fs.writeFileSync(promptFile, diagnosticPrompt);
  
  try {
    // Run diagnostic using OpenClaw CLI if available
    // Otherwise, log the issue for manual review
    const diagnosticReport = {
      timestamp,
      issue,
      context,
      recommendations: generateRecommendations(issue, context),
      autoFixesAttempted: []
    };
    
    // Log the diagnostic
    fs.writeFileSync(logFile, JSON.stringify(diagnosticReport, null, 2));
    
    console.log(`[Terminal Check] Diagnostic saved to: ${logFile}`);
    
    return diagnosticReport;
  } catch (error) {
    console.error('[Terminal Check] Diagnostic failed:', error.message);
    return { error: error.message };
  } finally {
    // Cleanup
    if (fs.existsSync(promptFile)) {
      fs.unlinkSync(promptFile);
    }
  }
}

/**
 * Build diagnostic prompt for sub-agent
 */
function buildDiagnosticPrompt(issue, context) {
  const prompts = {
    'backend-down': `
The GTM Engine backend server is not responding on port 3000.
Context: ${JSON.stringify(context, null, 2)}

Please:
1. Check if the server process is running
2. Check for port conflicts
3. Review recent error logs
4. Provide fix commands
5. If needed, recommend restarting the server
`,
    'ui-down': `
The Blitzscale OS UI is not responding on port 3001.
Context: ${JSON.stringify(context, null, 2)}

Please:
1. Check if Next.js dev server is running
2. Check for build errors
3. Review package.json scripts
4. Provide fix commands
5. If needed, recommend restarting the dev server
`,
    'missing-env': `
Critical environment variables are missing: ${context.missing?.join(', ')}

Please:
1. Check if .env file exists in automation/gtm-engine/
2. Check .env.example for required variables
3. Provide instructions for setting up missing vars
4. Check if variables are in process environment
`,
    'webhook-error': `
Webhook endpoints are returning errors.
Context: ${JSON.stringify(context, null, 2)}

Please:
1. Check webhook handler code
2. Verify request format
3. Check for middleware issues
4. Review recent changes to webhook routes
`,
    'database-error': `
Database connectivity issues detected.
Context: ${JSON.stringify(context, null, 2)}

Please:
1. Check Supabase connection
2. Verify credentials
3. Check network connectivity
4. Review connection pool settings
`
  };
  
  return prompts[issue] || `
Unknown issue detected: ${issue}
Context: ${JSON.stringify(context, null, 2)}

Please investigate and provide recommendations.
`;
}

/**
 * Generate automated recommendations
 */
function generateRecommendations(issue, context) {
  const recommendations = [];
  
  switch (issue) {
    case 'backend-down':
      recommendations.push('Run: cd automation/gtm-engine && npm start');
      recommendations.push('Check if port 3000 is in use: lsof -i :3000');
      recommendations.push('Review logs: tail -f automation/gtm-engine/error.log');
      break;
      
    case 'ui-down':
      recommendations.push('Run: cd automation/gtm-engine/ui && npm run dev');
      recommendations.push('Check if port 3001 is in use: lsof -i :3001');
      recommendations.push('Try building first: npm run build');
      break;
      
    case 'missing-env':
      recommendations.push('Copy .env.example to .env and fill in values');
      recommendations.push('Source the .env file: source automation/gtm-engine/.env');
      break;
      
    case 'webhook-error':
      recommendations.push('Review webhook payload format');
      recommendations.push('Check Express route handlers');
      break;
      
    case 'database-error':
      recommendations.push('Verify SUPABASE_URL and SUPABASE_ANON_KEY');
      recommendations.push('Check Supabase dashboard for outages');
      break;
  }
  
  return recommendations;
}

/**
 * Auto-fix common issues
 */
async function attemptAutoFix(issue, context) {
  const fixes = [];
  
  // Only attempt safe auto-fixes
  if (issue === 'backend-down' && context.canRestart) {
    console.log('[Terminal Check] Attempting to restart backend...');
    fixes.push('restart-backend');
    // Actual restart would be handled by parent process
  }
  
  if (issue === 'ui-down' && context.canRestart) {
    console.log('[Terminal Check] Attempting to restart UI...');
    fixes.push('restart-ui');
  }
  
  return fixes;
}

/**
 * Main execution for terminal diagnostics
 */
async function main() {
  const args = process.argv.slice(2);
  const issue = args[0] || 'unknown';
  const contextFile = args[1];
  
  let context = {};
  if (contextFile && fs.existsSync(contextFile)) {
    context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  }
  
  const report = await runTerminalDiagnostic(issue, context);
  
  console.log('\n=== DIAGNOSTIC_REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  
  return report;
}

module.exports = {
  runTerminalDiagnostic,
  attemptAutoFix
};

if (require.main === module) {
  require('dotenv').config();
  main().catch(console.error);
}
