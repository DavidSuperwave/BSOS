/**
 * Add Company Script
 * 
 * Usage:
 *   node scripts/add-company.js --name "Company Name" --slug company-slug --domain example.com
 * 
 * Options:
 *   --name     Company name (required)
 *   --slug     URL-friendly identifier (required)
 *   --domain   Company domain (optional)
 *   --workspace PlusVibe workspace ID (optional)
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';
const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || 'your-supermemory-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      params[args[i].replace('--', '')] = args[i + 1];
    }
  }
  
  return params;
}

async function checkTableExists() {
  const { error } = await supabase
    .from('companies')
    .select('count')
    .limit(1);
  
  return !error || error.code !== 'PGRST205';
}

async function initializeSupermemory(company) {
  const namespace = `blitzscale:company:${company.slug}`;
  
  console.log(`   Initializing Supermemory namespace: ${namespace}`);
  
  try {
    const response = await fetch('https://api.supermemory.com/v3/memories', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `# Company Profile: ${company.name}

Domain: ${company.domain || 'Not set'}
Slug: ${company.slug}
Created: ${new Date().toISOString()}

This is the knowledge base for ${company.name}. All company-specific information, ICPs, campaigns, and context will be stored here.`,
        containerTags: [namespace, 'company-info', 'system']
      })
    });

    if (!response.ok) {
      console.log(`   ⚠️  Supermemory init failed: ${response.status}`);
      return false;
    }

    console.log(`   ✅ Supermemory namespace initialized`);
    return true;
  } catch (err) {
    console.log(`   ⚠️  Supermemory init error: ${err.message}`);
    return false;
  }
}

async function createDefaultKnowledge(company) {
  const templates = [
    {
      title: 'Ideal Customer Profile (ICP)',
      content: `# ${company.name} - Ideal Customer Profile

## Target Industries
- [Add industries]

## Company Size
- Revenue: $X - $Y
- Employees: X - Y
- Growth stage: [Series A, B, C, etc.]

## Key Pain Points
1. [Pain point 1]
2. [Pain point 2]
3. [Pain point 3]

## Decision Makers
- Primary: [Title]
- Secondary: [Title]
- Influencers: [Titles]

## Qualification Criteria
- [ ] Budget: 
- [ ] Authority: 
- [ ] Need: 
- [ ] Timeline: `,
      category: 'icp'
    },
    {
      title: 'Email Campaign Templates',
      content: `# ${company.name} - Email Templates

## Cold Outreach Sequence

### Email 1: Initial Contact
Subject: [Personalized subject]

Body:
Hi {first_name},

[Opening hook related to their pain point]

[Value proposition - 1-2 sentences]

[Soft CTA]

Best,
[Your name]

---

### Email 2: Follow-up (Day 3)
Subject: Re: [Original subject]

Body:
Hi {first_name},

[Reference to first email]

[Additional value or case study]

[Stronger CTA]

Best,
[Your name]

---

### Email 3: Break-up (Day 7)
Subject: Closing the loop

Body:
Hi {first_name},

[Acknowledge busy schedule]

[Final value prop or offer]

[Clear next step or close]

Best,
[Your name]`,
      category: 'campaigns'
    }
  ];

  console.log(`   Creating default knowledge documents...`);

  for (const template of templates) {
    const { error } = await supabase
      .from('knowledge_documents')
      .insert({
        ...template,
        company_id: company.id,
        metadata: { template: true, editable: true }
      });

    if (error) {
      console.log(`   ⚠️  Failed to create ${template.title}: ${error.message}`);
    }
  }

  console.log(`   ✅ Default knowledge docs created`);
}

async function addCompany(params) {
  const { name, slug, domain, workspace } = params;

  console.log(`\n🏢 Creating company: ${name}\n`);
  console.log(`   Slug: ${slug}`);
  console.log(`   Domain: ${domain || '(not set)'}`);
  console.log(`   PlusVibe Workspace: ${workspace || '(not set)'}`);
  console.log('');

  // Check if companies table exists
  const tableExists = await checkTableExists();
  if (!tableExists) {
    console.log('❌ The "companies" table does not exist.');
    console.log('   Please run the SQL in supabase-companies.sql first.');
    console.log('   Go to: https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new\n');
    process.exit(1);
  }

  // Check if slug already exists
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existing) {
    console.log(`❌ Company with slug "${slug}" already exists.`);
    process.exit(1);
  }

  // Create company
  console.log('1. Creating company record...');
  const { data: company, error } = await supabase
    .from('companies')
    .insert({
      name,
      slug,
      domain: domain || null,
      plusvibe_workspace_id: workspace || null,
      supermemory_namespace: `blitzscale:company:${slug}`,
      settings: {
        created_by: 'cli',
        created_at: new Date().toISOString(),
        features: ['campaigns', 'knowledge', 'agent', 'analytics']
      }
    })
    .select()
    .single();

  if (error) {
    console.log(`❌ Failed to create company: ${error.message}`);
    process.exit(1);
  }

  console.log(`   ✅ Company created with ID: ${company.id}`);

  // Initialize Supermemory
  console.log('\n2. Initializing Supermemory namespace...');
  await initializeSupermemory(company);

  // Create default knowledge docs
  console.log('\n3. Creating default knowledge base...');
  await createDefaultKnowledge(company);

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('✅ COMPANY SETUP COMPLETE');
  console.log('═'.repeat(50));
  console.log(`
Company ID:   ${company.id}
Name:         ${company.name}
Slug:         ${company.slug}
Namespace:    blitzscale:company:${company.slug}
URL:          /c/${company.slug}
`);
  console.log('Next steps:');
  console.log('  1. Configure PlusVibe workspace (if not set)');
  console.log('  2. Invite team members');
  console.log('  3. Customize ICP and campaign templates');
  console.log('');

  return company;
}

// Main
const params = parseArgs();

if (!params.name || !params.slug) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   ADD COMPANY SCRIPT                         ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  node scripts/add-company.js --name "Company Name" --slug company-slug

Options:
  --name       Company display name (required)
  --slug       URL-friendly identifier (required)
  --domain     Company domain for email matching (optional)
  --workspace  PlusVibe workspace ID (optional)

Examples:
  node scripts/add-company.js --name "Acme Corp" --slug acme
  node scripts/add-company.js --name "Tech Startup" --slug techstartup --domain techstartup.io
`);
  process.exit(1);
}

addCompany(params).catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
