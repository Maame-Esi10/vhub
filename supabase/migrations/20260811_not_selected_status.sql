-- ============================================================
-- `not_selected` — resolving applications that never got an answer.
--
-- THE PROBLEM. Applicants past the waitlist cap are deliberately left
-- `pending` rather than rejected, which is right while the event is still
-- ahead: places genuinely free up through withdrawals and waitlist promotion,
-- so pending is an honest description of their position.
--
-- It stops being honest the moment the event closes or its date passes.
-- Nothing more can happen, and leaving someone `pending` forever means they
-- never get an answer at all. An event is a finite thing; people who did not
-- get a place need to be told so.
--
-- WHY A NEW VALUE RATHER THAN REUSING `rejected`. `rejected` means an
-- organisation looked at this person and declined them. Being crowded out of a
-- full event is not that, and labelling it so would show "Rejected" on the
-- volunteer's own screen for something that was never a judgement about them.
-- The distinction also has to survive in the data: a future no-show rate or
-- acceptance rate that counted these as rejections would misdescribe both the
-- volunteer and the organisation.
--
-- NO V-SCORE EFFECT. `not_selected` is not an event outcome. It never reaches
-- /api/vscore, and no penalty of any kind applies — not being selected is not
-- a failure, and the reputation system must not treat it as one.
-- ============================================================


-- ============================================================
-- SECTION 1 — add the enum value. RUN THIS ON ITS OWN, FIRST.
--
-- Postgres will not let a newly added enum value be USED in the same
-- transaction that adds it. Section 2 references 'not_selected', so it must be
-- a separate execution — run section 1, wait for it to report success, then
-- run section 2. Pasting both together fails with:
--   ERROR: unsafe use of new value "not_selected" of enum type
-- ============================================================

alter type application_status add value if not exists 'not_selected';


-- ============================================================
-- SECTION 2 — the resolver. Run after section 1 has committed.
--
-- ONE function, called from BOTH places that can end an outreach:
--   * the organisation closing it (status -> 'closed' / 'completed'), and
--   * the daily cron sweep, for events whose date has passed while still open.
--
-- One writer means an application cannot be resolved twice, and means the
-- wording and the no-penalty guarantee live in exactly one place.
--
-- Returns the rows it changed so the caller can notify precisely those people
-- in a single batch, rather than re-querying and risking a different set.
-- ============================================================

create or replace function resolve_unsuccessful_applications(p_outreach_id uuid)
returns table(application_id uuid, volunteer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update applications a
     set status = 'not_selected'
   where a.outreach_id = p_outreach_id
     -- Only these two. `accepted` earned a place, `cancelled` withdrew,
     -- `rejected` already had a decision, and `not_selected` is idempotent.
     and a.status in ('pending', 'waitlisted')
  returning a.id, a.volunteer_id;
end;
$$;

-- Service-role only. This writes other people's applications, so no client
-- session may call it; the serverless API invokes it with the service key,
-- following the same rule as every other cross-user write.
revoke all on function resolve_unsuccessful_applications(uuid) from public, anon, authenticated;


-- ============================================================
-- SECTION 3 — the cron sweep helper. Run with section 2.
--
-- Finds outreaches that are over but still carrying unresolved applications.
-- Deliberately a QUERY rather than a second writer: the daily job reads this
-- list and calls resolve_unsuccessful_applications() per outreach, so there
-- remains exactly one function that ever writes `not_selected`.
-- ============================================================

create or replace function outreaches_needing_resolution()
returns table(outreach_id uuid, unresolved_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select a.outreach_id, count(*) as unresolved_count
    from applications a
    join outreaches o on o.id = a.outreach_id
   where a.status in ('pending', 'waitlisted')
     and (
       -- The organisation ended it.
       o.status in ('closed', 'completed')
       -- Or the day came and went while it was still open.
       or (o.status = 'open' and o.date < current_date)
     )
   group by a.outreach_id;
$$;

revoke all on function outreaches_needing_resolution() from public, anon, authenticated;


-- ============================================================
-- SECTION 4 — verification. Should return the applications that WOULD be
-- resolved right now. Writes nothing.
-- ============================================================

select * from outreaches_needing_resolution();
