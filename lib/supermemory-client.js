/**
 * Supermemory Integration v2.0 - Maximum Potential
 * 
 * Implements full tagging strategy:
 * - Hierarchical container tags
 * - Rich metadata schemas
 * - Entity contexts
 * - Auto-tagging
 * - Relationship building
 */

const fetch = require('node-fetch');

const API_KEY = process.env.SUPERMEMORY_API_KEY;
const API_BASE = 'https://api.supermemory.ai/v3';

// ============================================
// CONTAINER TAG HIERARCHY
// ============================================

const ContainerTags = {
  company: (slug) => `company:${slug}`,
  companyEnv: (slug, env) => `company:${slug}:${env}`,
  agent: (name, type) => `agent:${name}:${type}`,
  user: (id, category) => `user:${id}:${category}`,
  shared: (domain, type) => `shared:${domain}:${type}`,
  temp: (session, expiry) => `temp:${session}:${expiry}`
};

// ============================================
// ENTITY CONTEXTS
// ============================================

const EntityContexts = {
  superwave: `
    COMPANY: Superwave - Outbound Email Infrastructure Provider
    
    Services:
    - Foundation ($200-500/mo): Managed infrastructure, 95%+ deliverability
    - Fuel ($1k-2k/mo): Infrastructure + human-verified lead data  
    - Engine ($7.5k-25k/mo): Full AI-powered campaign execution
    
    Target ICPs (Performance Ranked):
    1. CEO/Founder - 46.9% positive rate ⭐ BEST
    2. VP Sales - 26.7% positive rate
    3. Director of BD - 21.0% positive rate
    4. Sales Ops - 13.6% positive rate ⚠️ AVOID
    
    Top Industries:
    1. Staffing & Recruiting (2.4% avg reply rate)
    2. SaaS (1.6% avg reply rate)
    3. Sales Outsourcing (2.1% avg reply rate)
    
    Winning Angles:
    - "Stop burning domains" (infrastructure pain)
    - "Your SDRs need better data" (data quality)
    - "Book meetings while you sleep" (automation)
    
    Competitors: 11x.ai, Artisan.co, ScaledMail
    Differentiation: Hybrid AI + Human + Infrastructure
    
    Historical: Avg reply rate 1.97%, positive rate 0.44%
    Best Campaign: Staffing-VP-Sales (3.2% reply rate)
    
    When processing: Prioritize infrastructure pain points,
    emphasize deliverability expertise, compare to 11x.ai
  `,
  
  gtmFrameworks: `
    EMAIL FRAMEWORKS FOR B2B OUTBOUND
    
    Universal Rules: <75 words, strong offer upfront,
    hyper-relevant, casual tone, direct pain point,
    pattern disrupt preview, zero filler
    
    F1 Lead Magnet: Offer + Social Proof + CTA
    F2 Intro Offer: Free Work + P.S. Proof  
    F3 Dream Result: Result x Mechanism x Time + Guarantee
    F4 Pain Point: Pain + Solution + CTA + P.S.
    F5 Touchpoint: Touchpoint + Weakness + Solution
    F6 Combined: Touchpoint + Insight + Offer
    
    Match framework to persona sophistication
    A/B test F4 (Pain) vs F3 (Dream) for new markets
  `,
  
  staffingIndustry: `
    INDUSTRY: Staffing & Recruiting
    
    Pains: Domain burnout, bad data, low passive talent response,
    compliance concerns, recruiter turnover
    
    Buyers: VP Sales (outbound), Director BD (clients), Owners
    
    Triggers: Domain crisis, client complaints, bulk hiring needs
    
    Messaging: "Reach talent faster", "95%+ inbox placement",
    "Human-verified data"
    
    Seasonality: Q1 high volume, Q4 budget flush
  `
};

// ============================================
// METADATA SCHEMAS
// ============================================

const Schemas = {
  campaign: {
    required: ['type', 'company', 'campaign_id', 'campaign_name', 'industry', 'persona'],
    fields: {
      type: { type: 'string', value: 'campaign' },
      schema_version: { type: 'string', value: '2.0' },
      
      // Identification
      company: { type: 'string' },
      workspace_id: { type: 'string' },
      campaign_id: { type: 'string' },
      campaign_name: { type: 'string' },
      campaign_slug: { type: 'string' },
      
      // ICP
      industry: { type: 'string' },
      industry_subsegment: { type: 'string', optional: true },
      persona: { type: 'string' },
      persona_seniority: { type: 'enum', values: ['C-Level', 'VP', 'Director', 'Manager'] },
      company_size_target: { type: 'enum', values: ['11-50', '51-200', '201-500', '501-1000', '1000+'] },
      
      // Configuration
      tier: { type: 'enum', values: ['Foundation', 'Fuel', 'Engine'] },
      framework: { type: 'enum', values: ['deliverability-audit', 'done-for-you', 'scale-angle', 'client-churn', 'ramp-time', 'pipeline-consistency', 'custom'] },
      
      // Status
      status: { type: 'enum', values: ['draft', 'active', 'paused', 'completed', 'archived'] },
      status_history: { type: 'array' },
      
      // Creation
      naming_pattern: { type: 'enum', values: ['standard', 'manual_user_created', 'imported'] },
      is_cooked: { type: 'boolean' },
      cooked_confidence: { type: 'number', min: 0, max: 1 },
      requires_review: { type: 'boolean' },
      
      // Metrics
      metrics: {
        type: 'object',
        fields: {
          lead_count: { type: 'number' },
          sent_count: { type: 'number' },
          reply_count: { type: 'number' },
          positive_count: { type: 'number' },
          negative_count: { type: 'number' },
          neutral_count: { type: 'number' },
          ooo_count: { type: 'number' },
          bounce_count: { type: 'number' },
          reply_rate: { type: 'number' },
          positive_rate: { type: 'number' },
          meeting_booked_count: { type: 'number' }
        }
      },
      
      // Temporal
      created_at: { type: 'datetime' },
      activated_at: { type: 'datetime', optional: true },
      paused_at: { type: 'datetime', optional: true },
      completed_at: { type: 'datetime', optional: true },
      last_activity_at: { type: 'datetime' },
      
      // Relationships
      related_documents: {
        type: 'object',
        fields: {
          replies: { type: 'array', items: 'string' },
          insights: { type: 'array', items: 'string' },
          research: { type: 'array', items: 'string' },
          parent_campaign: { type: 'string', optional: true },
          child_campaigns: { type: 'array', items: 'string', optional: true }
        }
      },
      
      // Tagging
      tags: { type: 'array', items: 'string' },
      auto_tags: { type: 'array', items: 'string' }
    }
  },
  
  reply: {
    required: ['type', 'company', 'campaign_id', 'reply_id', 'from_email'],
    fields: {
      type: { type: 'string', value: 'reply' },
      schema_version: { type: 'string', value: '2.0' },
      
      company: { type: 'string' },
      campaign_id: { type: 'string' },
      workspace_id: { type: 'string' },
      
      reply_id: { type: 'string' },
      thread_id: { type: 'string', optional: true },
      message_id: { type: 'string', optional: true },
      
      from_email: { type: 'string' },
      from_name: { type: 'string', optional: true },
      from_domain: { type: 'string' },
      company_name: { type: 'string', optional: true },
      
      sentiment_category: { 
        type: 'enum', 
        values: ['positive_interested', 'positive_meeting', 'neutral_question', 'neutral_not_now', 
                 'negative_not_fit', 'negative_unsubscribe', 'negative_hostile', 'auto_ooo', 'auto_bounce']
      },
      sentiment_confidence: { type: 'number', min: 0, max: 1 },
      
      intent: { 
        type: 'enum', 
        values: ['booking_request', 'information_request', 'referral', 'competitor_mention', 'price_inquiry', 'general']
      },
      intent_confidence: { type: 'number', min: 0, max: 1 },
      
      has_booking_intent: { type: 'boolean' },
      booking_confidence: { type: 'number', min: 0, max: 1 },
      extracted_time: { type: 'string', optional: true },
      extracted_timezone: { type: 'string', optional: true },
      extracted_date: { type: 'string', optional: true },
      
      word_count: { type: 'number' },
      has_question: { type: 'boolean' },
      has_objection: { type: 'boolean' },
      mentioned_competitors: { type: 'array', items: 'string', optional: true },
      
      matched_persona: { type: 'string', optional: true },
      matched_industry: { type: 'string', optional: true },
      icp_fit_score: { type: 'number', min: 0, max: 100, optional: true },
      
      actions: {
        type: 'object',
        fields: {
          lead_created: { type: 'boolean' },
          lead_id: { type: 'string', optional: true },
          note_added: { type: 'boolean' },
          meeting_booked: { type: 'boolean' },
          event_id: { type: 'string', optional: true },
          replied: { type: 'boolean' }
        }
      },
      
      received_at: { type: 'datetime' },
      processed_at: { type: 'datetime' },
      
      related_campaign: { type: 'string' },
      related_lead: { type: 'string', optional: true }
    }
  },
  
  icp_insight: {
    required: ['type', 'company', 'insight_type', 'subject_value', 'metric_value'],
    fields: {
      type: { type: 'string', value: 'icp_insight' },
      schema_version: { type: 'string', value: '2.0' },
      
      company: { type: 'string' },
      
      insight_type: { 
        type: 'enum', 
        values: ['persona_performance', 'industry_performance', 'angle_performance', 
                 'framework_performance', 'timing_insight', 'objection_pattern', 'competitive_intel']
      },
      subject_category: { type: 'enum', values: ['persona', 'industry', 'angle', 'framework', 'time'] },
      subject_value: { type: 'string' },
      
      metric_name: { type: 'string' },
      metric_value: { type: 'number' },
      metric_unit: { type: 'enum', values: ['percentage', 'count', 'ratio'] },
      
      sample_size: { type: 'number' },
      confidence_level: { type: 'number', min: 0, max: 1 },
      margin_of_error: { type: 'number', optional: true },
      
      benchmark: { type: 'number', optional: true },
      previous_value: { type: 'number', optional: true },
      trend: { type: 'enum', values: ['up', 'down', 'stable'] },
      trend_significance: { type: 'enum', values: ['high', 'medium', 'low'] },
      
      validated: { type: 'boolean' },
      validation_method: { type: 'enum', values: ['manual', 'statistical', 'ab_test'], optional: true },
      validated_by: { type: 'string', optional: true },
      validated_at: { type: 'datetime', optional: true },
      
      recommended_action: { type: 'string' },
      expected_impact: { type: 'string' },
      priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },
      
      period_start: { type: 'datetime' },
      period_end: { type: 'datetime' },
      period_type: { type: 'enum', values: ['7d', '30d', '90d', 'custom'] },
      
      source_campaigns: { type: 'array', items: 'string' },
      source_replies: { type: 'number' },
      
      tags: { type: 'array', items: 'string' },
      auto_tags: { type: 'array', items: 'string' }
    }
  }
};

// ============================================
// AUTO-TAGGING ENGINE
// ============================================

class AutoTagger {
  static tagCampaign(campaign) {
    const tags = [];
    const metrics = campaign.metrics || {};
    
    // Performance tags
    if (metrics.reply_rate >= 3.0) {
      tags.push('high-performer', 'scale-candidate', '🏆');
    } else if (metrics.reply_rate >= 2.0) {
      tags.push('meets-target');
    } else if (metrics.reply_rate < 1.0) {
      tags.push('underperformer', 'needs-optimization', '⚠️');
    }
    
    // Positive rate tags
    if (metrics.positive_rate >= 30) {
      tags.push('hot-leads', 'prioritize-followup', '🔥');
    } else if (metrics.positive_rate >= 20) {
      tags.push('warm-leads');
    }
    
    // Activity tags
    const daysSince = campaign.last_activity_at ? 
      Math.floor((Date.now() - new Date(campaign.last_activity_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    if (daysSince > 7) {
      tags.push('stale', 'review-needed');
    }
    if (daysSince > 30) {
      tags.push('archive-candidate');
    }
    
    // Status tags
    if (campaign.status === 'active' && metrics.lead_count < 500) {
      tags.push('low-leads', 'needs-leads', '⚠️');
    }
    
    // Framework tags
    if (campaign.is_cooked) {
      tags.push('cooked-angle', 'user-created', '👨‍🍳');
      if (metrics.reply_rate >= 2.5) {
        tags.push('proven-cooked', 'document-pattern');
      }
    }
    
    return tags;
  }
  
  static tagReply(reply) {
    const tags = [];
    
    // Urgency tags
    if (reply.has_booking_intent && reply.booking_confidence > 0.9) {
      tags.push('hot-lead', 'respond-immediately', '🔥');
    } else if (reply.has_booking_intent) {
      tags.push('warm-lead', 'booking-intent');
    }
    
    // Sentiment tags
    if (reply.sentiment_category === 'positive_meeting') {
      tags.push('meeting-ready', 'high-intent');
    }
    if (reply.sentiment_category === 'negative_unsubscribe') {
      tags.push('unsubscribe', 'do-not-contact');
    }
    
    // Competitor tags
    if (reply.mentioned_competitors?.length > 0) {
      tags.push('competitor-mentioned', 'competitive-deal');
    }
    
    // Content tags
    if (reply.word_count < 10) {
      tags.push('short-reply', 'low-engagement');
    }
    if (reply.has_question) {
      tags.push('question-asked', 'education-needed');
    }
    if (reply.has_objection) {
      tags.push('objection-raised', 'handle-concern');
    }
    
    // ICP match
    if (reply.icp_fit_score >= 80) {
      tags.push('high-icp-fit', 'priority-lead');
    }
    
    return tags;
  }
}

// ============================================
// SUPERMEMORY API CLIENT
// ============================================

class SupermemoryClient {
  constructor(apiKey = API_KEY) {
    this.apiKey = apiKey;
  }
  
  async request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supermemory API error: ${response.status} - ${error}`);
    }
    
    return response.json();
  }
  
  // Document Management
  async addDocument(content, metadata, options = {}) {
    const autoTags = metadata.type === 'campaign' ? AutoTagger.tagCampaign(metadata) :
                     metadata.type === 'reply' ? AutoTagger.tagReply(metadata) : [];
    
    // Flatten metadata for Supermemory (all values must be strings)
    const flattenedMetadata = this.flattenMetadata({
      ...metadata,
      auto_tags: [...(metadata.auto_tags || []), ...autoTags].join(','),
      tags: (metadata.tags || []).join(','),
      timestamp: new Date().toISOString()
    });
    
    return this.request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        content,
        containerTag: options.containerTag || ContainerTags.company(metadata.company),
        customId: options.customId,
        entityContext: options.entityContext || EntityContexts[metadata.company],
        metadata: flattenedMetadata
      })
    });
  }
  
  // Flatten nested objects to string values
  flattenMetadata(metadata) {
    const flattened = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (typeof value === 'object') {
        // Convert objects/arrays to JSON strings
        flattened[key] = JSON.stringify(value);
      } else {
        // Convert primitives to strings
        flattened[key] = String(value);
      }
    }
    
    return flattened;
  }
  
  async batchAddDocuments(documents) {
    return this.request('/documents/batch', {
      method: 'POST',
      body: JSON.stringify({ documents })
    });
  }
  
  async search(query, options = {}) {
    return this.request('/search', {
      method: 'POST',
      body: JSON.stringify({
        q: query,
        containerTags: options.containerTags || [ContainerTags.company(options.company)],
        limit: options.limit || 10,
        filters: options.filters
      })
    });
  }
  
  async updateDocument(documentId, updates) {
    return this.request(`/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
  
  // Container Tag Management
  async setContainerContext(containerTag, entityContext) {
    return this.request(`/container-tags/${containerTag}`, {
      method: 'PATCH',
      body: JSON.stringify({ entityContext })
    });
  }
  
  async getContainerContext(containerTag) {
    return this.request(`/container-tags/${containerTag}`);
  }
  
  // Advanced Search with Filters
  async advancedSearch({
    query,
    company,
    filters = {},
    sort,
    limit = 10,
    offset = 0
  }) {
    const searchBody = {
      q: query,
      containerTags: [ContainerTags.company(company)],
      limit,
      offset
    };
    
    if (filters) {
      searchBody.filters = filters;
    }
    
    return this.request('/search', {
      method: 'POST',
      body: JSON.stringify(searchBody)
    });
  }
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  SupermemoryClient,
  ContainerTags,
  EntityContexts,
  Schemas,
  AutoTagger,
  
  // Convenience functions
  createClient: (apiKey) => new SupermemoryClient(apiKey),
  
  // Quick operations
  async storeCampaign(campaignData, company = 'superwave') {
    const client = new SupermemoryClient();
    const content = `
Campaign: ${campaignData.campaign_name}
Industry: ${campaignData.industry} | Persona: ${campaignData.persona}
Status: ${campaignData.status} | Tier: ${campaignData.tier}
Framework: ${campaignData.framework}

Metrics:
- Leads: ${campaignData.metrics?.lead_count || 0}
- Sent: ${campaignData.metrics?.sent_count || 0}
- Replies: ${campaignData.metrics?.reply_count || 0} (${campaignData.metrics?.reply_rate?.toFixed(2)}%)
- Positive: ${campaignData.metrics?.positive_count || 0} (${campaignData.metrics?.positive_rate?.toFixed(2)}%)

${campaignData.is_cooked ? '👨‍🍳 Cooked Angle (User-Created)' : ''}
${campaignData.requires_review ? '⚠️ Requires Review' : ''}
    `.trim();
    
    return client.addDocument(content, {
      ...campaignData,
      type: 'campaign',
      company
    });
  },
  
  async storeReply(replyData, company = 'superwave') {
    const client = new SupermemoryClient();
    const content = `
Reply from ${replyData.from_name || replyData.from_email}
Campaign: ${replyData.campaign_id}
Sentiment: ${replyData.sentiment_category} (${(replyData.sentiment_confidence * 100).toFixed(0)}%)

${replyData.has_booking_intent ? `📅 Booking Intent: ${replyData.extracted_time} (${(replyData.booking_confidence * 100).toFixed(0)}%)` : ''}

Content:
${replyData.body?.substring(0, 500)}...
    `.trim();
    
    return client.addDocument(content, {
      ...replyData,
      type: 'reply',
      company
    });
  },
  
  async queryInsights(query, company = 'superwave', options = {}) {
    const client = new SupermemoryClient();
    return client.advancedSearch({
      query,
      company,
      ...options
    });
  }
};
