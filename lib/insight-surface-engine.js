/**
 * Insight Surface Engine
 * 
 * Surfaces relevant insights at decision points
 * Queries Supermemory with advanced filters
 */

const { SupermemoryClient, ContainerTags } = require('./supermemory-client');

class InsightSurfaceEngine {
  constructor(company = 'superwave') {
    this.client = new SupermemoryClient();
    this.company = company;
  }

  /**
   * Get insights when creating a new campaign
   */
  async getInsightsForCampaignCreation(industry, persona, tier) {
    console.log(`🔍 Surfacing insights for new campaign: ${industry} → ${persona} (${tier})`);
    
    const insights = {
      recommendedAngles: [],
      warnings: [],
      competitiveIntel: [],
      benchmarks: {}
    };
    
    try {
      // 1. Best angles for this industry/persona
      const angleResults = await this.client.advancedSearch({
        query: 'best performing angle framework high reply rate',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'icp_insight' },
            { key: 'insight_type', value: 'angle_performance' },
            { 
              OR: [
                { key: 'subject_value', value: industry },
                { key: 'subject_value', value: persona }
              ]
            }
          ]
        },
        sort: [{ key: 'metric_value', order: 'desc' }],
        limit: 3
      });
      
      insights.recommendedAngles = angleResults.results || [];
      
      // 2. Common objections to avoid
      const objectionResults = await this.client.advancedSearch({
        query: 'objection negative reply pattern avoid',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'icp_insight' },
            { key: 'insight_type', value: 'objection_pattern' },
            { key: 'industry', value: industry }
          ]
        },
        limit: 5
      });
      
      insights.warnings = objectionResults.results || [];
      
      // 3. Competitor intelligence
      const competitorResults = await this.client.advancedSearch({
        query: 'competitor positioning differentiation market intelligence',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'research' },
            { key: 'research_type', value: 'competitor_analysis' }
          ]
        },
        limit: 1
      });
      
      insights.competitiveIntel = competitorResults.results || [];
      
      // 4. Industry benchmarks
      const benchmarkResults = await this.client.advancedSearch({
        query: 'industry benchmark average reply rate performance',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'icp_insight' },
            { key: 'insight_type', value: 'industry_performance' },
            { key: 'subject_value', value: industry }
          ]
        },
        limit: 1
      });
      
      if (benchmarkResults.results?.[0]) {
        const b = benchmarkResults.results[0];
        insights.benchmarks = {
          avgReplyRate: b.metadata?.metric_value,
          sampleSize: b.metadata?.sample_size,
          confidence: b.metadata?.confidence_level
        };
      }
      
    } catch (error) {
      console.error('Error surfacing insights:', error.message);
    }
    
    return insights;
  }

  /**
   * Get insights when processing a reply
   */
  async getInsightsForReply(reply) {
    const insights = {
      similarReplies: [],
      suggestedResponse: null,
      bookingAvailability: null
    };
    
    try {
      // If negative reply, find similar patterns and solutions
      if (reply.sentiment_category?.startsWith('negative')) {
        const similarResults = await this.client.advancedSearch({
          query: reply.body?.substring(0, 100) || 'negative objection',
          company: this.company,
          filters: {
            AND: [
              { key: 'type', value: 'reply' },
              { key: 'sentiment_category', operator: 'startsWith', value: 'negative' }
            ]
          },
          limit: 5
        });
        
        insights.similarReplies = similarResults.results || [];
        
        // Find successful responses to similar objections
        if (insights.similarReplies.length > 0) {
          // Look for follow-up messages that converted
          // This would require tracking conversation threads
        }
      }
      
      // If booking intent, check live availability via Calendly
      if (reply.has_booking_intent) {
        try {
          const now = new Date();
          const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const startTime = now.toISOString();
          const endTime = nextWeek.toISOString();

          const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
          const CALENDLY_EVENT_TYPE_UUID = process.env.CALENDLY_EVENT_TYPE_UUID;
          const CALENDLY_BASE_URL = 'https://api.calendly.com/v2';

          if (CALENDLY_API_KEY && CALENDLY_EVENT_TYPE_UUID) {
            const response = await fetch(
              `${CALENDLY_BASE_URL}/event_type_available_times?` +
              `event_type=${CALENDLY_EVENT_TYPE_UUID}&` +
              `start_time=${encodeURIComponent(startTime)}&` +
              `end_time=${encodeURIComponent(endTime)}`,
              {
                headers: {
                  'Authorization': `Bearer ${CALENDLY_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
              }
            );

            if (response.ok) {
              const data = await response.json();
              const slots = (data.collection || []).slice(0, 5).map(s => {
                const d = new Date(s.start_time);
                return d.toLocaleString('en-US', {
                  weekday: 'long', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short'
                });
              });
              insights.bookingAvailability = { suggestedSlots: slots, source: 'calendly_live' };
            } else {
              console.warn('[InsightEngine] Calendly API returned', response.status);
              insights.bookingAvailability = { suggestedSlots: [], source: 'calendly_error', error: `API ${response.status}` };
            }
          } else {
            insights.bookingAvailability = { suggestedSlots: [], source: 'calendly_not_configured' };
          }
        } catch (calError) {
          console.error('[InsightEngine] Calendly availability check failed:', calError.message);
          insights.bookingAvailability = { suggestedSlots: [], source: 'calendly_error', error: calError.message };
        }
      }
      
    } catch (error) {
      console.error('Error surfacing reply insights:', error.message);
    }
    
    return insights;
  }

  /**
   * Get optimization recommendations for existing campaigns
   */
  async getOptimizationRecommendations() {
    console.log('🔍 Generating optimization recommendations...');
    
    const recommendations = {
      highPerformers: [],
      underPerformers: [],
      quickWins: [],
      strategicChanges: []
    };
    
    try {
      // Get all active campaigns
      const campaignResults = await this.client.advancedSearch({
        query: 'campaign active performance metrics',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'campaign' },
            { key: 'status', value: 'active' }
          ]
        },
        limit: 50
      });
      
      const campaigns = campaignResults.results || [];
      
      // Analyze each campaign
      for (const campaign of campaigns) {
        const m = campaign.metadata?.metrics || {};
        const replyRate = m.reply_rate || 0;
        const positiveRate = m.positive_rate || 0;
        
        // High performer
        if (replyRate >= 3.0 || positiveRate >= 30) {
          recommendations.highPerformers.push({
            name: campaign.metadata?.campaign_name,
            replyRate,
            positiveRate,
            recommendation: 'Scale budget, expand targeting, duplicate angle'
          });
        }
        
        // Under performer
        else if (replyRate < 1.0) {
          recommendations.underPerformers.push({
            name: campaign.metadata?.campaign_name,
            replyRate,
            positiveRate,
            recommendation: 'Pause and review targeting/messaging'
          });
        }
        
        // Quick win potential
        else if (replyRate >= 1.5 && replyRate < 2.0) {
          recommendations.quickWins.push({
            name: campaign.metadata?.campaign_name,
            replyRate,
            recommendation: 'Test new angle, minor optimizations could push to 2%+'
          });
        }
      }
      
      // Get validated insights for strategic changes
      const insightResults = await this.client.advancedSearch({
        query: 'validated insight recommendation high confidence',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'icp_insight' },
            { key: 'validated', value: true },
            { key: 'confidence_level', operator: 'gte', value: 0.9 },
            { key: 'priority', value: 'high' }
          ]
        },
        limit: 5
      });
      
      recommendations.strategicChanges = insightResults.results || [];
      
    } catch (error) {
      console.error('Error generating recommendations:', error.message);
    }
    
    return recommendations;
  }

  /**
   * Get persona performance comparison
   */
  async getPersonaPerformance() {
    try {
      const results = await this.client.advancedSearch({
        query: 'persona performance positive reply rate',
        company: this.company,
        filters: {
          AND: [
            { key: 'type', value: 'icp_insight' },
            { key: 'insight_type', value: 'persona_performance' }
          ]
        },
        sort: [{ key: 'metric_value', order: 'desc' }]
      });
      
      return (results.results || []).map(r => ({
        persona: r.metadata?.subject_value,
        positiveRate: r.metadata?.metric_value,
        sampleSize: r.metadata?.sample_size,
        confidence: r.metadata?.confidence_level,
        trend: r.metadata?.trend
      }));
      
    } catch (error) {
      console.error('Error getting persona performance:', error.message);
      return [];
    }
  }

  /**
   * Format insights for display
   */
  formatInsightsForDisplay(insights) {
    let output = '\n📊 **SURFACED INSIGHTS**\n\n';
    
    // Recommended angles
    if (insights.recommendedAngles?.length > 0) {
      output += '🎯 **Top Performing Angles**\n';
      insights.recommendedAngles.forEach((angle, i) => {
        const m = angle.metadata || {};
        output += `${i + 1}. ${m.subject_value}: ${m.metric_value}% reply rate (${m.sample_size} samples)\n`;
        if (m.recommended_action) {
          output += `   💡 ${m.recommended_action}\n`;
        }
      });
      output += '\n';
    }
    
    // Warnings
    if (insights.warnings?.length > 0) {
      output += '⚠️ **Watch Out For**\n';
      insights.warnings.forEach(warning => {
        const m = warning.metadata || {};
        output += `• ${m.subject_value}: ${m.recommended_action}\n`;
      });
      output += '\n';
    }
    
    // Benchmarks
    if (insights.benchmarks?.avgReplyRate) {
      output += '📈 **Industry Benchmark**\n';
      output += `Average reply rate: ${insights.benchmarks.avgReplyRate}%\n`;
      output += `Sample size: ${insights.benchmarks.sampleSize}\n`;
      output += `Confidence: ${(insights.benchmarks.confidence * 100).toFixed(0)}%\n\n`;
    }
    
    return output;
  }
}

module.exports = { InsightSurfaceEngine };
