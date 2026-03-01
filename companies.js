/**
 * Multi-Company Manager
 * 
 * Handles multiple client workspaces with isolated data
 */

const fs = require('fs');
const path = require('path');

const COMPANIES_DIR = path.join(__dirname, 'companies');

/**
 * List all configured companies
 */
function listCompanies() {
  const files = fs.readdirSync(COMPANIES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
  console.log('📋 Configured Companies:');
  files.forEach(slug => {
    const config = loadCompany(slug);
    console.log(`   ${config.name} (${slug})`);
    console.log(`      Workspace: ${config.plusvibe.workspaceId}`);
    console.log(`      Campaigns: ${config.campaigns.active.length} active, ${config.campaigns.draft.length} draft`);
    console.log('');
  });
  
  return files;
}

/**
 * Load company configuration
 */
function loadCompany(slug) {
  const configPath = path.join(COMPANIES_DIR, `${slug}.json`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Company not found: ${slug}`);
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Create new company configuration
 */
function createCompany({ name, slug, website, plusvibeWorkspaceId, plusvibeApiKey, closeApiKey }) {
  const config = {
    name,
    slug,
    website: website || '',
    plusvibe: {
      workspaceId: plusvibeWorkspaceId,
      apiKey: plusvibeApiKey
    },
    close: {
      apiKey: closeApiKey,
      statuses: {
        interested: '',
        nurture: '',
        badFit: ''
      }
    },
    supermemory: {
      containerTag: `company:${slug}`,
      apiKey: process.env.SUPERMEMORY_API_KEY
    },
    icp: {
      industries: [],
      roles: [],
      companySizes: [],
      excludeRoles: [],
      excludeIndustries: []
    },
    campaigns: {
      active: [],
      paused: [],
      draft: []
    },
    metrics: {
      replyRateTarget: 2.0,
      positiveRateTarget: 0.5,
      oooRateTarget: 10,
      currentReplyRate: 0,
      currentPositiveRate: 0,
      currentOOORate: 0
    },
    createdAt: new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString().split('T')[0]
  };
  
  const configPath = path.join(COMPANIES_DIR, `${slug}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`✅ Created company config: ${configPath}`);
  return config;
}

/**
 * Update company configuration
 */
function updateCompany(slug, updates) {
  const config = loadCompany(slug);
  const updated = { ...config, ...updates, updatedAt: new Date().toISOString().split('T')[0] };
  
  const configPath = path.join(COMPANIES_DIR, `${slug}.json`);
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
  
  console.log(`✅ Updated company: ${slug}`);
  return updated;
}

/**
 * Get active company (from env or default)
 */
function getActiveCompany() {
  const activeSlug = process.env.ACTIVE_COMPANY || 'superwave';
  return loadCompany(activeSlug);
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'list':
      listCompanies();
      break;
      
    case 'create':
      // Parse args: --name="X" --slug="x" --workspace="xxx" --apikey="xxx"
      const params = {};
      args.slice(1).forEach(arg => {
        const match = arg.match(/--(\w+)="?([^"]+)"?/);
        if (match) params[match[1]] = match[2];
      });
      
      if (!params.name || !params.slug) {
        console.log('Usage: node companies.js create --name="Company Name" --slug="company-slug" --workspace="xxx" --apikey="xxx" --closekey="xxx"');
        process.exit(1);
      }
      
      createCompany({
        name: params.name,
        slug: params.slug,
        website: params.website,
        plusvibeWorkspaceId: params.workspace,
        plusvibeApiKey: params.apikey,
        closeApiKey: params.closekey
      });
      break;
      
    case 'show':
      const slug = args[1] || 'superwave';
      const config = loadCompany(slug);
      console.log(JSON.stringify(config, null, 2));
      break;
      
    default:
      console.log('BLITZSCALE OS - Company Manager');
      console.log('');
      console.log('Commands:');
      console.log('  node companies.js list');
      console.log('  node companies.js create --name="Name" --slug="slug" --workspace="xxx" --apikey="xxx" --closekey="xxx"');
      console.log('  node companies.js show [slug]');
      console.log('');
      console.log('Environment:');
      console.log('  ACTIVE_COMPANY=slug - Set active company for operations');
  }
}

module.exports = {
  listCompanies,
  loadCompany,
  createCompany,
  updateCompany,
  getActiveCompany
};
