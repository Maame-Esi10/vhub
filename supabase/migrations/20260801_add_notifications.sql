-- Adds the notifications table backing the Notifications screen
-- (design-refs/Notifications.png).
--
-- WHY A TABLE. Until now the four dispatch sites (/api/match notify_candidates,
-- /api/application-status, the reminder cron, and the test action) pushed to
-- Expo and kept no record. An Expo push is fire-and-forget: once the OS banner
-- is dismissed it is gone, and nothing can answer "what did I miss last week?"
-- The design requires day-grouped history ("TODAY" / "YESTERDAY") and a
-- read/unread state per row, neither of which can be derived from the OS.
-- So every dispatch now also writes a row here, and the screen reads THIS,
-- not the notification tray.
--
-- CLIENTS CANNOT INSERT. There is deliberately no insert policy: rows are
-- written only by the serverless API on the service-role key, which bypasses
-- RLS. A volunteer able to insert here could fabricate a "Documents Verified"
-- or "Application accepted" entry for themselves -- harmless to the database,
-- but the screen is exactly where a user goes to confirm such a claim, so it
-- must only ever reflect what the server actually did.
--
-- UPDATE IS NARROWED TO read_at BY COLUMN GRANT, not by policy. RLS decides
-- which ROWS a user may update and cannot restrict which COLUMNS (see the
-- column-level write protection block at the bottom of schema.sql). Without
-- the grant below, "mark as read" -- an ordinary PATCH the client must be able
-- to make -- would also let it rewrite title/body/type/outreach_id of its own
-- notifications, turning a read receipt into a content-forgery primitive and
-- defeating the no-insert rule above by another route.
--
-- outreach_id is a real FK column rather than only a key inside `data` so the
-- cascade cleans up notifications when an outreach is deleted, and so the row
-- can be joined. It is nullable: not every notification type refers to one.
--
-- Idempotent: safe to re-run. Already folded into supabase/schema.sql.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('new_match', 'application_status', 'event_reminder', 'test')),
  title text not null,
  body text not null,
  outreach_id uuid references outreaches(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Serves the only read the app makes: this user's rows, newest first.
create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own"
  on notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Marking read/unread only. No insert or delete policy by design.
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own"
  on notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Column-level write protection -- same mechanism as the block at the bottom
-- of schema.sql: revoke the table-level privilege Supabase grants by default,
-- then grant back only the column the client legitimately writes. Expressed
-- as revoke-then-grant, NOT `revoke update (col)`, because a column-level
-- revoke does not carve a hole in a table-level grant and would be a no-op.
revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;
