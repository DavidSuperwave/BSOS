/**
 * Calendly Integration - Smart Meeting Booking
 * 
 * Automatically detects booking requests in replies and creates Calendly events
 * Also supports manual booking via API
 */

const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
const CALENDLY_EVENT_TYPE_UUID = process.env.CALENDLY_EVENT_TYPE_UUID;
const CALENDLY_BASE_URL = 'https://api.calendly.com/v2';

/**
 * Parse reply content for booking intent
 * Looks for time/date patterns like "3pm EST Friday", "Tuesday at 2pm", etc.
 */
export function detectBookingIntent(replyText: string): {
  hasIntent: boolean;
  suggestedTime?: string;
  confidence: number;
} {
  const text = replyText.toLowerCase();
  
  // Booking keywords
  const bookingKeywords = [
    'book', 'schedule', 'meeting', 'call', 'chat', 'talk', 'connect',
    'calendly', 'zoom', 'available', 'free', 'time', 'slot'
  ];
  
  // Time patterns
  const timePatterns = [
    /(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,  // 3pm, 3:30pm, 15:00
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /(tomorrow|next week)/i,
    /(\d{1,2})\s*(am|pm)\s*(est|pst|cst|mst)/i,
  ];
  
  const hasBookingKeyword = bookingKeywords.some(kw => text.includes(kw));
  const hasTimePattern = timePatterns.some(pattern => pattern.test(text));
  
  // Extract specific time if mentioned
  let suggestedTime: string | undefined;
  
  // Look for patterns like "3pm EST Friday" or "Friday at 3pm"
  const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)\s*(est|pst|cst|mst)?/i);
  const dayMatch = text.match(/(monday|tuesday|wednesday|thursday|friday)/i);
  
  if (timeMatch && dayMatch) {
    suggestedTime = `${timeMatch[0]} ${dayMatch[0]}`;
  }
  
  const confidence = hasBookingKeyword && hasTimePattern ? 0.9 : 
                    hasBookingKeyword ? 0.6 : 
                    hasTimePattern ? 0.4 : 0;
  
  return {
    hasIntent: hasBookingKeyword || hasTimePattern,
    suggestedTime,
    confidence
  };
}

/**
 * Generate Calendly scheduling link
 */
export async function generateSchedulingLink(
  email: string,
  name: string,
  customAnswers?: Record<string, string>
): Promise<{
  success: boolean;
  schedulingUrl?: string;
  error?: string;
}> {
  try {
    if (!CALENDLY_API_KEY || !CALENDLY_EVENT_TYPE_UUID) {
      throw new Error('Calendly API key or event type not configured');
    }

    // Get user's scheduling link
    const response = await fetch(`${CALENDLY_BASE_URL}/event_types/${CALENDLY_EVENT_TYPE_UUID}`, {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }

    const data = await response.json();
    const baseUrl = data.resource?.scheduling_url;
    
    if (!baseUrl) {
      throw new Error('No scheduling URL found');
    }

    // Build URL with pre-filled data
    const url = new URL(baseUrl);
    url.searchParams.set('email', email);
    url.searchParams.set('name', name);
    
    // Add custom answers if provided
    if (customAnswers) {
      Object.entries(customAnswers).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return {
      success: true,
      schedulingUrl: url.toString()
    };
  } catch (error) {
    console.error('❌ [Calendly] generateSchedulingLink failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get available time slots from Calendly
 */
export async function getAvailableSlots(
  startTime: string,
  endTime: string
): Promise<{
  success: boolean;
  slots?: Array<{
    start_time: string;
    end_time: string;
    invitees_remaining: number;
  }>;
  error?: string;
}> {
  try {
    if (!CALENDLY_API_KEY || !CALENDLY_EVENT_TYPE_UUID) {
      throw new Error('Calendly not configured');
    }

    const response = await fetch(
      `${CALENDLY_BASE_URL}/event_type_available_times?` +
      `event_type=${CALENDLY_EVENT_TYPE_UUID}&` +
      `start_time=${encodeURIComponent(startTime)}&` +
      `end_time=${encodeURIComponent(endTime)}`,
      {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      success: true,
      slots: data.collection || []
    };
  } catch (error) {
    console.error('❌ [Calendly] getAvailableSlots failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Book a meeting directly (requires invitee to confirm via email)
 */
export async function createInstantBooking(
  eventTypeUuid: string,
  inviteeEmail: string,
  inviteeName: string,
  startTime: string,
  timezone: string = 'America/New_York',
  customAnswers?: Record<string, string>
): Promise<{
  success: boolean;
  booking?: {
    uri: string;
    start_time: string;
    end_time: string;
    invitee: {
      email: string;
      name: string;
    };
  };
  error?: string;
}> {
  try {
    if (!CALENDLY_API_KEY) {
      throw new Error('Calendly API key not configured');
    }

    const response = await fetch(`${CALENDLY_BASE_URL}/scheduled_events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: eventTypeUuid,
        invitee: {
          email: inviteeEmail,
          name: inviteeName
        },
        start_time: startTime,
        timezone,
        custom_answers: customAnswers || {}
      })
    });

    if (!response.ok) {
      throw new Error(`Calendly API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      success: true,
      booking: {
        uri: data.resource?.uri,
        start_time: data.resource?.start_time,
        end_time: data.resource?.end_time,
        invitee: {
          email: inviteeEmail,
          name: inviteeName
        }
      }
    };
  } catch (error) {
    console.error('❌ [Calendly] createInstantBooking failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle reply with potential booking request
 * This is the main function called by reply-monitor
 */
export async function handleReplyWithBookingIntent(reply: {
  id: string;
  from_email: string;
  from_name?: string;
  body: string;
  campaign_id?: string;
}): Promise<{
  action: 'none' | 'suggest' | 'auto_send';
  message?: string;
  schedulingUrl?: string;
  confidence: number;
}> {
  console.log('📅 [Calendly] Checking reply for booking intent...');
  
  const intent = detectBookingIntent(reply.body);
  
  if (!intent.hasIntent || intent.confidence < 0.6) {
    return { action: 'none', confidence: intent.confidence };
  }
  
  // Generate scheduling link
  const linkResult = await generateSchedulingLink(
    reply.from_email,
    reply.from_name || reply.from_email.split('@')[0],
    {
      campaign_id: reply.campaign_id || 'unknown',
      reply_id: reply.id
    }
  );
  
  if (!linkResult.success) {
    return {
      action: 'none',
      message: `Failed to generate scheduling link: ${linkResult.error}`,
      confidence: intent.confidence
    };
  }
  
  // High confidence = suggest sending link
  if (intent.confidence >= 0.8) {
    return {
      action: 'suggest',
      message: `High booking intent detected: "${reply.body.substring(0, 100)}..."`,
      schedulingUrl: linkResult.schedulingUrl,
      confidence: intent.confidence
    };
  }
  
  return {
    action: 'suggest',
    message: `Possible booking intent detected`,
    schedulingUrl: linkResult.schedulingUrl,
    confidence: intent.confidence
  };
}

/**
 * Send scheduling link via reply (automated follow-up)
 */
export async function sendSchedulingReply(
  campaignId: string,
  leadEmail: string,
  schedulingUrl: string,
  customMessage?: string
): Promise<{
  success: boolean;
  message: string;
}> {
  const defaultMessage = `Thanks for your interest! You can book a time that works for you here: ${schedulingUrl}\n\nLooking forward to chatting!`;
  
  const message = customMessage || defaultMessage;
  
  // This would integrate with PlusVibe's reply system
  // For now, log the action
  console.log('📧 [Calendly] Would send reply:');
  console.log(`   To: ${leadEmail}`);
  console.log(`   Campaign: ${campaignId}`);
  console.log(`   Message: ${message}`);
  
  return {
    success: true,
    message: 'Scheduling link prepared (manual send required)'
  };
}

export default {
  detectBookingIntent,
  generateSchedulingLink,
  getAvailableSlots,
  createInstantBooking,
  handleReplyWithBookingIntent,
  sendSchedulingReply
};
