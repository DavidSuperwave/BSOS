/**
 * BLITZSCALE OS - Daily Cron Schedule
 * 
 * Julian's daily operations for GTM Engine
 * Run via: node cron-scheduler.js
 */

const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

console.log('⚙️  BLITZSCALE OS Cron Scheduler Starting...');
console.log('📅 Timezone: America/Mexico_City (CST)');
console.log('');

// Helper to run scripts
function runScript(scriptName, description) {
  const scriptPath = path.join(__dirname, scriptName);
  console.log(`[${new Date().toISOString()}] Running: ${description}`);
  
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ ${scriptName} failed:`, error.message);
      return;
    }
    if (stderr) {
      console.error(`⚠️  ${scriptName} stderr:`, stderr);
    }
    console.log(`✅ ${scriptName} output:`, stdout.substring(0, 500));
  });
}

// ============================================
// DAILY CRON SCHEDULE (CST)
// ============================================

// 6:00 AM - Deliverability Test
// Tests inbox placement for Gmail, Outlook, Yahoo
cron.schedule('0 6 * * *', () => {
  runScript('deliverability-monitor.js', '🔍 Daily Deliverability Test');
}, { timezone: 'America/Mexico_City' });

// 7:00 AM - Lead Count Check
// Alerts if any campaign has < 500 leads
cron.schedule('0 7 * * *', () => {
  runScript('lead-alerts.js', '📊 Lead Count Check');
}, { timezone: 'America/Mexico_City' });

// 8:00 AM - Campaign Detection + Volume Report
// Detects new campaigns, tracks account capacity
cron.schedule('0 8 * * *', () => {
  runScript('campaign-detector-v3.js', '🎯 Campaign Detection (v3)');
  setTimeout(() => runScript('volume-tracker.js', '📈 Volume Tracker'), 30000);
}, { timezone: 'America/Mexico_City' });

// 9:00 AM - Daily GTM Report (Main)
// Comprehensive report to Telegram
cron.schedule('0 9 * * *', () => {
  runScript('gtm-daily-report.js', '📋 Daily GTM Report');
}, { timezone: 'America/Mexico_City' });

// 12:00 PM - Midday Health Check
// Lead counts + deliverability pulse
cron.schedule('0 12 * * *', () => {
  runScript('lead-alerts.js', '📊 Midday Lead Check');
}, { timezone: 'America/Mexico_City' });

// 5:00 PM - Reply Sentiment Summary
// Analyzes day's replies with 8-category classification
cron.schedule('0 17 * * *', () => {
  runScript('enhanced-reply-monitor.js', '💬 Reply Sentiment Analysis');
}, { timezone: 'America/Mexico_City' });

// 6:00 PM - Negative Reply Audit
// Diagnoses targeting issues from negative replies
cron.schedule('0 18 * * *', () => {
  runScript('negative-reply-audit.js', '🔍 Negative Reply Audit');
}, { timezone: 'America/Mexico_City' });

// 11:00 PM - Supermemory Sync
// Syncs learnings to memory
cron.schedule('0 23 * * *', () => {
  runScript('supermemory.js', '🧠 Supermemory Sync');
}, { timezone: 'America/Mexico_City' });

// ============================================
// HOURLY CHECKS (Business Hours 7AM-7PM)
// ============================================

// Every hour - Reply Monitor
// Checks for new replies and processes them
cron.schedule('0 7-19 * * *', () => {
  runScript('reply-monitor.js', '📧 Hourly Reply Check');
}, { timezone: 'America/Mexico_City' });

console.log('✅ Cron jobs scheduled:');
console.log('   6:00 AM - Deliverability Test');
console.log('   7:00 AM - Lead Count Check');
console.log('   8:00 AM - Campaign Detection + Volume Report');
console.log('   9:00 AM - Daily GTM Report (Telegram)');
console.log('   12:00 PM - Midday Health Check');
console.log('   5:00 PM - Reply Sentiment Analysis');
console.log('   6:00 PM - Negative Reply Audit');
console.log('   11:00 PM - Supermemory Sync');
console.log('');
console.log('   HOURLY (7AM-7PM) - Reply Monitor');
console.log('');
console.log('🤖 BLITZSCALE OS is running...');
console.log('Press Ctrl+C to stop');
