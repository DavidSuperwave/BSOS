/**
 * Perplexity AI Research Module
 * 
 * 3-prompt research pipeline for GTM strategy
 * Cost: ~$4.20 per company onboarding
 */

const fetch = require('node-fetch');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const API_URL = 'https://api.perplexity.ai/chat/completions';

/**
 * Run full research pipeline for a company
 */
async function runResearchPipeline(companyProfile) {
  console.log(`🔬 Starting Perplexity research for ${companyProfile.name}...`);
  
  const results = {
    timestamp: new Date().toISOString(),
    company: companyProfile.name,
    market: null,
    tam: null,
    icp: null
  };

  try {
    // Prompt 1: Market Research
    console.log('   Prompt 1: Market Research (~$1.40)...');
    results.market = await queryPerplexity(buildMarketPrompt(companyProfile));
    
    // Prompt 2: TAM Mapping
    console.log('   Prompt 2: TAM Mapping (~$1.40)...');
    results.tam = await queryPerplexity(buildTAMPrompt(companyProfile));
    
    // Prompt 3: ICP Validation
    console.log('   Prompt 3: ICP Validation (~$1.40)...');
    results.icp = await queryPerplexity(buildICPPrompt(companyProfile));
    
    console.log('✅ Research complete!');
    return results;
    
  } catch (error) {
    console.error('❌ Research pipeline failed:', error.message);
    throw error;
  }
}

/**
 * Query Perplexity API
 */
async function queryPerplexity(prompt) {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar-deep-research',
      messages: [
        {
          role: 'system',
          content: 'You are a GTM research analyst. Provide detailed, structured insights with citations. Always respond in valid JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // Try to parse JSON, fallback to raw text
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content, citations: data.citations || [] };
  }
}

/**
 * Build Market Research Prompt
 */
function buildMarketPrompt(profile) {
  return `
Research ${profile.name} (${profile.website}) and their market landscape:

COMPANY INFO:
- What they do: ${profile.whatTheyDo || 'Not specified'}
- Business model: ${profile.businessModel || 'B2B'}
- Target industries: ${(profile.targetIndustries || []).join(', ')}

RESEARCH TASK:
1. Company positioning and key differentiators
2. Top 5 competitors with their messaging analysis
3. Market gaps and opportunities
4. Typical GTM challenges in their space
5. Suggested offer angles based on market position
6. Industry trends affecting their outbound strategy

OUTPUT FORMAT (JSON):
{
  "positioning": "string",
  "differentiators": ["string"],
  "competitors": [
    {"name": "string", "messaging": "string", "weakness": "string"}
  ],
  "marketGaps": ["string"],
  "gtmChallenges": ["string"],
  "suggestedAngles": ["string"],
  "trends": ["string"]
}
`;
}

/**
 * Build TAM Mapping Prompt
 */
function buildTAMPrompt(profile) {
  return `
For ${profile.name} targeting ${(profile.targetIndustries || ['B2B companies']).join(', ')}:

RESEARCH TASK:
1. Map all qualified industries and sub-segments
2. Prioritize into Tier 1 (highest fit), Tier 2, Tier 3
3. List decision-maker titles by segment
4. Identify trigger events for each segment
5. Suggested budget allocation across tiers
6. Market size estimates where available

OUTPUT FORMAT (JSON):
{
  "tiers": {
    "tier1": {
      "segments": [{"industry": "string", "subSegment": "string", "rationale": "string"}],
      "decisionMakers": ["string"],
      "triggers": ["string"]
    },
    "tier2": { ... },
    "tier3": { ... }
  },
  "budgetAllocation": {"tier1": "%", "tier2": "%", "tier3": "%"},
  "totalAddressableMarket": "string"
}
`;
}

/**
 * Build ICP Validation Prompt
 */
function buildICPPrompt(profile) {
  const hypotheses = profile.targetRoles || ['VP of Sales', 'Director of Sales', 'CEO'];
  
  return `
Validate ICP hypotheses for ${profile.name}:

HYPOTHESES TO VALIDATE:
${hypotheses.map(h => `- ${h}`).join('\n')}

For each persona:
1. Is this persona actually the decision maker?
2. What pain points do they prioritize?
3. What messaging resonates with them?
4. What's the best channel to reach them?
5. Common objections and how to counter them
6. Validation score (0-100) with rationale

OUTPUT FORMAT (JSON):
{
  "personas": [
    {
      "title": "string",
      "isDecisionMaker": boolean,
      "authority": "string (high/medium/low)",
      "painPoints": ["string"],
      "messaging": ["string"],
      "channels": ["string"],
      "objections": [{"objection": "string", "counter": "string"}],
      "validationScore": number,
      "rationale": "string"
    }
  ],
  "recommendations": ["string"]
}
`;
}

/**
 * Store research results in Supermemory
 */
async function storeResearchResults(results, companySlug, supermemory) {
  console.log('🧠 Storing research in Supermemory...');
  
  const content = `
GTM RESEARCH REPORT - ${results.company}
Generated: ${results.timestamp}

MARKET INTELLIGENCE:
${JSON.stringify(results.market, null, 2)}

TAM MAPPING:
${JSON.stringify(results.tam, null, 2)}

ICP VALIDATION:
${JSON.stringify(results.icp, null, 2)}
`;

  await supermemory.addDocument(content, {
    type: 'research',
    company: companySlug,
    timestamp: results.timestamp,
    tags: ['gtm', 'research', 'icp', 'market']
  });
  
  console.log('✅ Research stored');
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const companySlug = args[0] || 'superwave';
  
  // Load company config
  const fs = require('fs');
  const path = require('path');
  
  const configPath = path.join(__dirname, 'companies', `${companySlug}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Company config not found: ${configPath}`);
    process.exit(1);
  }
  
  const companyProfile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  runResearchPipeline(companyProfile)
    .then(results => {
      console.log('\n📊 RESEARCH RESULTS:');
      console.log(JSON.stringify(results, null, 2));
      
      // Save to file
      const outputPath = path.join(__dirname, `research-${companySlug}-${Date.now()}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Saved to: ${outputPath}`);
    })
    .catch(error => {
      console.error('❌ Research failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runResearchPipeline,
  queryPerplexity,
  storeResearchResults
};
