-- Add outbound-focused event types for dashboard activity tracking.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (
    event_type IN (
      'action_item',
      'insight',
      'alert',
      'status_update',
      'cron_result',
      'reply_received',
      'lead_qualified',
      'campaign_paused',
      'email_reply',
      'meeting_booked',
      'opportunity_created'
    )
  );
