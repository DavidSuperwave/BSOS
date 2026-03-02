/**
 * Insight Surface Engine
 * 
 * Surfaces relevant insights at decision points:
 * - When a lead replies with interest → show their context
 * - When booking a call → show availability + lead history  
 * - During live call → surface objection handlers
 * - After call → suggest next steps
 */

const fetch = require('node-fetch');

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const SUPERMEMORY_BASE_URL = 'https://api.supermemory.ai/v3';
const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
const CALENDLY_EVENT_TYPE_UUID = process.env.CALENDLY_EVENT_TYPE_UUID;

/**
 * Get lead context from Supermemory
 */
async function getLeadContext(leadEmail) {
  if (!SUPERMEMORY_API_KEY) {
    console.log('[InsightEngine] Supermemory not configured, skipping lead context');
    return null;
  }
  
  try {
    const response = await fetch(
      `${SUPERMEMORY_BASE_URL}/search?query=${encodeURIComponent(leadEmail)}&limit=5`,
      {
        headers: { 
          'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Supermemory error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('[InsightEngine] Supermemory fetch error:', error.message);
    return null;
  }
}

/**
 * Get Calendly availability for next 3 business days
 * Returns up to 5 real available slots, formatted in EST
 */
async function getBookingAvailability() {
  if (!CALENDLY_API_KEY || !CALENDLY_EVENT_TYPE_UUID) {
    console.log('[InsightEngine] Calendly not configured, returning empty availability');
    return [];
  }
  
  try {
    // Next 3 business days window
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0); // Start 1 hour from now
    const end = new Date(start);
    end.setDate(end.getDate() + 5); // Look 5 days ahead to get 3 business days
    
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    
    const eventTypeUri = `https://api.calendly.com/event_types/${CALENDLY_EVENT_TYPE_UUID}`;
    const url = `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${encodeURIComponent(startISO)}&end_time=${encodeURIComponent(endISO)}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }
    
    const data = await response.json();
    const slots = data.collection || [];
    
    // Format up to 5 slots in EST
    const formatted = slots.slice(0, 5).map(slot => {
      const dt = new Date(slot.start_time);
      return dt.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
    });
    
    return formatted;
  } catch (error) {
    console.error('[InsightEngine] Calendly availability error:', error.message);
    return [];
  }
}

/**
 * Surface insights for an interested reply
 */
async function surfaceReplyInsights(reply) {
  const {
    lead_email,
    lead_name,
    reply_text,
    campaign_name,
    sentiment
  } = reply;
  
  console.log(`[InsightEngine] Surfacing insights for ${lead_email}...`);
  
  // Fetch context in parallel
  const [leadContext, availability] = await Promise.all([
    getLeadContext(lead_email),
    sentiment === 'BOOKING' || sentiment === 'INTERESTED' ? getBookingAvailability() : Promise.resolve([])
  ]);
  
  const insights = {
    lead: {
      email: lead_email,
      name: lead_name,
      campaign: campaign_name
    },
    context: leadContext ? leadContext.slice(0, 3).map(r => r.content || r.text) : [],
    availability: availability,
    suggested_response: buildSuggestedResponse(sentiment, lead_name, availability)
  };
  
  return insights;
}

/**
 * Build suggested response based on sentiment
 */
function buildSuggestedResponse(sentiment, name, availability) {
  const firstName = name ? name.split(' ')[0] : 'there';
  
  switch (sentiment) {
    case 'INTERESTED':
      if (availability.length > 0) {
        return `Hi ${firstName},\n\nGreat to hear from you! I'd love to set up a quick call.\n\nHere are some times that work on my end:\n${availability.slice(0, 3).map(s => `• ${s}`).join('\n')}\n\nDoes any of these work for you? Or feel free to grab a time directly: [Calendly Link]`;
      }
      return `Hi ${firstName},\n\nThanks for your interest! I'd love to connect. What time works best for you this week?`;
      
    case 'BOOKING':
      if (availability.length > 0) {
        return `Hi ${firstName},\n\nHere are my available slots:\n${availability.slice(0, 3).map(s => `• ${s}`).join('\n')}\n\nOr book directly: [Calendly Link]`;
      }
      return `Hi ${firstName},\n\nHappy to set something up! Here's my calendar: [Calendly Link]`;
      
    case 'OOO':
      return `Hi ${firstName},\n\nNo worries — I'll follow up when you're back. Enjoy your time off!`;
      
    case 'OBJECTION':
      return `Hi ${firstName},\n\nI appreciate the honest feedback. Would you be open to a quick 15-min call to explore if there might be a fit?`;
      
    default:
      return `Hi ${firstName},\n\nThanks for getting back to me! Would love to connect — what does your schedule look like this week?`;
  }
}

/**
 * Main entry point
 */
async function processReply(replyData) {
  const insights = await surfaceReplyInsights(replyData);
  
  if (process.env.NODE_ENV !== 'test') {
    console.log('\n=== INSIGHT SURFACE ENGINE ===');
    console.log(`Lead: ${insights.lead.email}`);
    if (insights.context.length > 0) {
      console.log(`\nContext (${insights.context.length} memories):`);
      insights.context.forEach((c, i) => console.log(`  ${i+1}. ${c.substring(0, 100)}...`));
    }
    if (insights.availability.length > 0) {
      console.log(`\nAvailability (${insights.availability.length} slots):`);
      insights.availability.forEach(slot => console.log(`  - ${slot}`));
    }
    console.log(`\nSuggested Response:\n${insights.suggested_response}`);
  }
  
  return insights;
}

module.exports = {
  processReply,
  surfaceReplyInsights,
  getLeadContext,
  getBookingAvailability,
  buildSuggestedResponse
};
