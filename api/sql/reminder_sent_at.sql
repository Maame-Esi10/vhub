-- V-HUB API -- applications.reminder_sent_at column.
-- NOT applied automatically. Copy-paste into the Supabase SQL editor
-- yourself, same as supabase/schema.sql. Safe to re-run.
--
-- Marks when the 24-hour event reminder push (see /api/notifications'
-- "send-event-reminders" cron action) was sent for this application, so the
-- cron job never double-sends. Nullable; null = not yet reminded.
--
-- No new column-privilege grant is needed: supabase/schema.sql already runs
-- `revoke update on applications from authenticated; grant update (status,
-- cancellation_reason) on applications to authenticated;` -- since
-- reminder_sent_at is not in that explicit grant list, it is automatically
-- NOT client-writable (only the service-role API can set it), consistent
-- with match_score/cancelled_at/late_cancellation's existing protection.

alter table applications add column if not exists reminder_sent_at timestamptz;
