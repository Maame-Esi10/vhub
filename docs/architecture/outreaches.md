# Outreaches: subscription, availability, multi-role, multi-day, gallery


## Oversubscription and under-subscription (spec is final)

**Oversubscribed.** `lib/roster.ts` (pure, unit-tested) holds the rules. One-tap
**Accept top N** fills the free slots best-first by ranking score (match ×
reliability multiplier — the same ordering the screen displays, derived from one
projection so the button can never pick a different N from the N shown). The
surplus is **waitlisted, never auto-rejected**; the waitlist is capped at
`max(2 × slots_total, 5)` and anyone beyond the cap is **left pending**, not
refused. Rejection stays a deliberate per-person act. A **skill-coverage**
indicator sits above the button — coverage is a property of the team (one holder
covers a skill) and answers what a per-volunteer match score cannot. Waitlist
position is **computed, never stored**, from the same ranking the promotion rule
uses; the volunteer sees it via `/api/waitlist-position` (RLS hides the other
applicants, so the client cannot rank). Batch decisions go through
`/api/application-status` as `{ outreachId, decisions: [...] }` — accepts are
applied one row at a time, in order, because `slots_filled <= slots_total` is a
check constraint that would reject a bulk overshoot in full. Partial success is
reported as partial success.

**Under-subscribed.** `lib/underSubscription.ts` (pure, unit-tested) +
`api/src/server/underSubscription.ts` (I/O), riding the existing daily 08:00
cron. Staged escalation at **7 / 3 / 1 days** out for `open` outreaches with
`slots_filled < slots_total`: 7 = the organisation alone; 3 = plus matching
volunteers in the outreach's region; 1 = plus matching volunteers in adjacent
regions too. **The app informs, it never advises** — it must never suggest
reducing slots or rescheduling, and a unit test asserts the generated copy
contains no such advice. Escalation widens REACH; the requirement never moves.
Unverified volunteers ARE notified for `support`-role outreaches (they may Quick
Join those) and are not for clinical ones. Deduped via
`notifications.data->>'stage'`, the same no-schema-change technique as the
check-in reminder.

## Continuous availability (owner-approved and built 2026-09-08)

**Availability is the share of an outreach's days a volunteer can cover, capped once past a usable threshold** — no longer all-or-nothing. `availabilityScore` in `lib/matching/layer1.ts`; `AVAILABILITY_FULL_COVERAGE = 0.5`. No migration: the day rows already existed, and nothing about the weights or the other four components moved.

- **What it replaced was worse than binary.** The old check read `outreaches.date` — the FIRST day — and nothing else. On a twenty-day campaign a volunteer free on day one scored full marks regardless of the other nineteen, and a volunteer free for days two to twenty scored ZERO. Neither number described anything real.
- **Both obvious repairs are wrong in opposite directions.** Requiring every day excludes precisely the Saturday-only student this platform exists to include; accepting any single day scores 1-of-20 identically to 20-of-20. The share, capped, is the only shape that does neither.
- **Why the cap exists at all.** An uncapped fraction would give a volunteer covering ten days of twenty half marks for a real, substantial commitment — a statement about the event's LENGTH rather than about the volunteer. Same error the V-Score avoided by computing an outcome once per event instead of once per day.
- **SINGLE-DAY OUTREACHES DO NOT MOVE, exactly.** One day is covered or it is not, so coverage is 1 or 0 and the scaling leaves both untouched. This is what made the change safe to ship without recomputing anything, and a test asserts it.
- **Each day is judged against ITS OWN hours**, falling back to the event's — the reader that per-day hours needed. A campaign whose Saturday runs in the evening is a different question for a Saturday-morning volunteer than the rest of the week is.
- **An unparseable day is EXCLUDED FROM THE DENOMINATOR, never counted as unavailable.** We cannot tell which weekday token to look for, so it is a day we cannot judge, and charging a volunteer for the organisation's malformed date is the `DEFAULT_MISSING_SUBSCORE` mistake again. If no day is judgeable it fails closed at 0, the long-standing behaviour for an outreach with no usable date.
- **`Layer1OutreachInput.days` being absent means "not loaded", NOT "no days".** The scorer falls back to `date` as the single day — exactly the old behaviour — so a caller whose day read failed degrades rather than scoring everybody at zero. Every outreach structurally has at least one day row, so an empty array can only ever mean a read that did not happen.
- **`fetchDaysByOutreach` in `api/src/server/outreachInput.ts` is the one loader**, used by all four `/api/match` paths and by the under-subscription escalation. ONE `.in()` query per batch, never one per outreach — the ranked feed scores every open outreach in a region. A failure logs and degrades, the same call `fetchRolesByOutreach` already makes.
- **The inheritance rule (`day.start_time ?? outreach.start_time`) is RESTATED in `layer1.ts`, not imported.** `lib/outreachDays.ts` is its canonical home, but importing it would drag a `components/` path into the serverless API's bundle, and `layer1.ts` deliberately imports nothing but types and one constant. If that rule ever changes, both must move together.

## Multi-role outreaches

An outreach may specify per-category role slots ("2 doctors, 3 nurses, 5 students") via the `outreach_roles` child table, or stay single-role using `outreaches.required_category` exactly as before. **The two modes are distinguished by the presence of child rows and nothing else** — there is no `is_multi_role` flag, because a boolean that must agree with the existence of rows will eventually disagree with it.

- **Uniqueness is a unique INDEX** over `(outreach_id, category, coalesce(min_experience_level, 'any'))`, not a plain constraint. `min_experience_level` is NULL for "any level" and NULL never equals NULL in a unique constraint, so a plain constraint would permit two "nurse, any level" rows.
- **`min_experience_level` is a FLOOR** ("this level or above"), never an exact match — otherwise an "any level" role could not accept an experienced volunteer, and "1 experienced lead + 4 of any level" would be inexpressible.
- **Scoring takes the MAXIMUM across roles**, never an average: a volunteer fills one slot, so their score is their fit for the best place available to them. `lib/matching/multiRole.ts`, additive — `computeLayer1MatchScore` is untouched and an outreach with no roles delegates straight back to it, so no existing score moves.
- **Full roles and below-floor roles are still scored and flagged**, never skipped. Only exclude the genuinely impossible.
- **The verification gate reads the ROLE APPLIED FOR**, not the outreach. A clinical role needs verification; a support role on the same event does not. This is the point of the feature — a drive needing 3 nurses and 6 helpers must not have to choose between locking out unverified helpers and waving unverified people into clinical work. `outreaches.role_type` summarises to 'clinical' if any role is, for display and coarse filtering only.
- **`slots_total`/`slots_filled` are trigger-derived in multi-role mode** (the sum of the roles), so the wizard must not send `slots_total` there. Every trigger is guarded on the existence of role rows, so single-role outreaches are untouched. **No backfill, ever** — it would silently convert every existing outreach to multi-role mode.

## Multi-day outreaches (approved 2026-08-12; schema applied 2026-08-15; app built 2026-08-18)

An outreach runs over one or more days (`outreach_days`, one row per day). **Single-day is the n=1 case** — every outreach has exactly one row, so there is no branching and no "is multi-day" flag. `outreaches.date` stays the FIRST day, trigger-maintained, so the feed bound, reminder window, escalation stages and lifecycle close all keep working unchanged.

- **A volunteer commits to specific days when applying** (`application_days`). That selection is the commitment, and it is the unit everything else counts against — hence a table, not a count.
- **Attendance is scored on days committed vs days attended, never against the event's span.** Days never committed to are irrelevant: no penalty, no absence, not counted. Scoring against the span would mark a Saturday-only student absent for 26 days they never promised.
- **Attendance is per day**: `attendance` is keyed `(outreach_id, volunteer_id, outreach_day_id)`. One scan must never cover a month.
- **"2 nurses" on a role means per day**, not for the event.
- **Within-day shifts need no new concept** — the morning/afternoon/evening availability slots already cover them.
- The organiser resolves attendance per day as they go; unresolved days simply do not count, exactly as an unrated review moves nothing.

**How the app holds it up (20260818_multi_day_app_support.sql + `lib/outreachDays.ts`):**

- **Every outreach has at least one day, structurally.** `trg_outreaches_default_day` writes an `outreach_days` row in the same transaction as the outreach, so a dayless outreach cannot exist. Client code is never the thing that has to remember.
- **Day-level `start_time`/`end_time` mean OVERRIDE, and NULL means inherit.** Read them through `dayStartTime()` / `dayEndTime()`, never off the column: a copy of the outreach's hours would shadow a later edit to them.
- **The application and its committed days are ONE transaction** (`apply_to_outreach()`, SECURITY INVOKER). Two requests would, on any failure between them, leave an application promising nothing — unfixable from the volunteer's side, because the row already exists and re-applying is refused. No day ids sent means every day, which is the honest reading of a one-day event and of a quick join.
- **A day volunteers committed to cannot be deleted** (`trg_outreach_days_refuse_committed_delete`): `application_days` cascades, and those rows are the evidence a V-Score is derived from. An organisation whose day 3 was rained off does not need to delete it — an unresolved day costs nobody anything.
- **Rescheduling is not the same as changing the day set.** One day moving to one different day is an in-place UPDATE inside `save_outreach()`, so the row keeps its id and its commitments; treating it as remove-then-add would hit the refusal above and lock every organisation out of changing their own date.
- **`sync_single_day_from_outreach` stands aside for `save_outreach()`** via `set_config('vhub.skip_day_sync', …, true)`. Without that, adding an EARLIER day to a one-day outreach moves the existing row (and its commitments) onto the new date and re-inserts the intended day fresh — the set looks right and the promises are on the wrong dates.
- **`outreaches.date` is derived from `p_days` inside `save_outreach`, not taken from `p_date`**, so the two can never disagree.
- **Anything asking "is it over?" must read the LAST day** (`lastDay`), never `outreaches.date`. Judging on the first day finishes a four-day campaign on the evening of day one, dropping it off the volunteer's Schedule and taking the check-in action with it.
- **Anything DISPLAYING a date shows the whole span** (`formatDaySpan`), and a list fetches the days for every row in ONE `.in()` query (`useOutreachDaysForMany`), never one query per card. Where the screen is about what a volunteer PROMISED — the Applications tracker, the Schedule — it also shows the commitment (`useApplicationDaysForMany` + `describeCommitment`), because the event's span overstates what a Saturday-only volunteer signed up for. Every surface falls back to `outreaches.date` when the day rows have not arrived. The Schedule's date group HEADERS stay a single date on purpose: they group by the day an event starts and one header can cover several events.
- **Check-in is per day and gated on today.** `/api/checkin` resolves the day from today's `outreach_days` row and refuses a scan on a day the event does not run; there is no honest day to file it against otherwise. The venue anchor is checked against THAT day, not `outreaches.date`, or every scan on days 2..n reads as unverified.
- **The organiser's `resolve` takes an explicit `outreachDayId`**, inferred only when the outreach has exactly one day. Guessing would file an absence against a day they were not looking at.
- **Check-in reminders are driven by `outreach_days`, scoped to the people who committed to that day, and deduped on `stage` + `outreachDayId`.** Every one of those three was a real bug against `outreaches.date`: no reminder after day one, students chased about days they declined, and day one's reminder silencing every later day.

## Per-day release (approved 2026-08-21; migration `20260821_per_day_release.sql`)

A volunteer may **drop future days they committed to**. Days already attended stay recorded and untouched.

- **A release is an UPDATE, never a DELETE.** `application_days.released_at` marks it and the row stays, because the row is the evidence a V-Score is derived from — a deleted row cannot be told apart from a day never promised, carries no timestamp, and cannot be judged late. **`DELETE` on `application_days` is revoked**; it had never been, so a crafted client call could erase a commitment silently.
- **A released day leaves the COMMITTED COUNT**, so days-attended ÷ days-committed stays honest. It is not a failure and is not an absence.
- **Everything that COUNTS days filters `released_at is null`** — every commitment hook, the organiser's per-day roster, and the check-in reminders. The reminders' "has any commitment" test deliberately does NOT filter, because that test exists to spot pre-commitment applications with no rows at all; filtering it would make an application whose days were all released fall through to "every day".
- **Lateness is judged against THAT DAY's start, never the event's first day**, with two edges: within 24 hours AND before the start. A day that has already started **cannot be released at all** — that is a no-show at −15, owned by attendance, and allowing it would let someone convert a no-show into the lighter penalty.
- **Releasing the last day still ahead is withdrawing** and is refused, so it goes through the withdrawal path and the waitlist is offered the place. Only while the event has not begun: someone who attended days 1–2 and drops 3–4 took part, and cancelling their application would erase an attended event.
- **A released day can be taken back on** while it is still in the future, and that clears the late flag.
- **The late-release deduction is APPROVED and built (2026-08-21):** two free in a rolling 90 days, then `-8 × (days released ÷ days committed)`, floored at −2 and capped at −8. `-8 ×` is the coefficient because releasing the whole commitment IS a withdrawal and already takes the existing −8 by that path, so the formula meets the established scale exactly at its own edge. The floor stops one day of a twenty-day campaign rounding to nothing; the cap keeps it clear of the −15 reserved for a no-show, which is right because somebody who releases a day told you. `lateReleasePenalty()` in `lib/vscore.ts`.
- **Day shortfall is DERIVED, never stored** (`lib/dayCoverage.ts`, approved 2026-08-21). `slots_filled` counts accepted PEOPLE, so an event can read "5 of 5 filled" while one day has four on it. Counting live commitments per day answers that with no new column to keep in step. **Every day is measured against the outreach's own `slots_total`** — there are deliberately NO per-day targets, because a target is a statement of intent and cannot be derived from anything.
- **The under-subscription ladder climbs PER DAY.** It selects `outreach_days` landing exactly `stage.daysOut` away rather than `outreaches.date`, and dedupes on `stage` + `outreachDayId`. This fixed two silences at once: a campaign short on day five never escalated at all, and a released day left an event reading full while a day of it was short.
- **A card that shows both numbers must name the difference.** When the event reads full and a day does not, the dashboard card states the day figure explicitly — two true numbers with no explanation read as a bug.
- **A partial release does not move `slots_filled`**, which counts accepted people rather than day-seats, so the event still reads full while one day is short. See the day-shortfall note in `docs/REPORT_NOTES.md`.

**Per-day hours, built 2026-09-08 (build-queue item 11).** `outreach_days.start_time`/`end_time` had always meant "override the event's hours", with NULL meaning inherit — and nothing could set them. No migration was needed: the columns exist and are already in `outreach_days`' INSERT and UPDATE grant lists.

- **The form's day is ONE structure carrying its date AND its hours** (`OutreachDayDraft` in `lib/outreachDays.ts`), never a `string[]` with a `Record<day, hours>` beside it. Same rule as `is_multi_role`: two things that must agree eventually disagree, and here the failure would be a removed day's hours re-attaching themselves to a different day added later.
- **NULL still means inherit, and must never be flattened to `''`.** On the outreach an empty string is the form's "not set"; on a day, null is "the same hours as the event". Collapsing them would make every ordinary day read as a cleared override. `trimClockSecondsOrNull` exists only for this.
- **Hidden until asked for.** A day is a chip; tapping it opens a panel for that day alone. A start and an end picker on every chip is forty controls on a twenty-day campaign, for a case that almost never arises, and it invites organisations to fill in hours they never meant to vary.
- **The hours are written OUTSIDE `save_outreach()`, and that is the gallery's argument, not a shortcut.** That function is one transaction because `role_type` and `slots_total` are DERIVED from the role rows. Nothing on `outreaches` is derived from a day's hours, so a failed write leaves every day inheriting the event's — visible, retryable, and the state it was in a moment before. Widening the RPC signature would be a gated migration for a write with nothing to keep in step.
- **`useSetOutreachDayHours` does one UPDATE per changed day, NEVER an upsert.** `.upsert(…, { onConflict: 'outreach_id,day' })` puts the conflict columns in the SET clause, and `outreach_id` is deliberately absent from the UPDATE grant list — a day may be re-timed, never moved to another event — so the upsert fails `permission denied for table outreach_days` on a call that looks perfectly reasonable.
- **Day ONE always needs the follow-up write.** `trg_outreaches_default_day` creates it inside the outreach's own transaction with null hours, so an override on it cannot ride along with an insert the way days 2..n can.
- **Clearing an override is a write of NULLs, not an omission.** `changedDayHours` returns cleared days carrying nulls; filtering them out for "having no hours" would make removal work in the form and change nothing in the database.
- **Any screen printing ONE time range beside a day span must ask `hoursVaryByDay` first.** "Oct 3 – Oct 6 · 9:00 AM – 3:00 PM" is a claim about all four days and becomes false the moment one overrides; both detail screens now say "Hours vary by day" instead. It compares the RESOLVED hours, so a day overriding with exactly the event's own varies from nothing.

**Nothing from the multi-day work is still gated.** Continuous availability was approved and built on 2026-09-08 — see the section below. The `event_outcome` scaling by `days_attended / days_committed` was approved 2026-08-30 and is built; `attendedRatio` in `lib/outreachDays.ts` is an alias of `dayCommitmentRatio` in `lib/vscore.ts`, so the figure a screen shows and the figure the score is scaled by are one function.

**This paragraph replaced two that contradicted each other**, and the contradiction is worth remembering rather than just deleting: one line called continuous availability "still gated and NOT built" while the next called it "gated, approved, not yet implemented". Both were written truthfully at different times and neither was updated when the other changed. **When a gate opens or closes, search this file for every mention of it** — a second statement left behind is worse than no statement, because it makes the reader stop and ask which line to trust.

## Event gallery (built 2026-08-17)

`outreach_images` holds several images per outreach — the event's poster, photos, promotional images — **entirely separately from `outreaches.flyer_url`**, which is unchanged. The flyer is the ONE banner that heads the feed card, the detail hero and the wizard preview; the gallery is a different thing. Neither falls back to the other, and an outreach may have either, both or neither. **Do not merge them.**

- **Capped at 8 per outreach by `trg_outreach_images_cap`**, not by the form. RLS decides which rows; column GRANTs decide which columns; neither can count rows, so a cap has to be a trigger.
- **`position` is deliberately NOT unique** — a unique constraint turns every reorder into a dance with temporary values. Ties break on `created_at`, so the order is still total.
- **`outreach_id` is absent from the UPDATE grant list**: an image can be recaptioned and reordered, never moved to another event.
- **Gallery writes do NOT go through `save_outreach()`.** The roles need that transaction because `role_type` and `slots_total` are DERIVED from them; nothing on `outreaches` is derived from the gallery, so a failed image write leaves an outreach with fewer images — visible and retryable — rather than an inconsistent event. In the editor images save immediately and the control says so; in the wizard the outreach does not exist yet, so URLs are held in form state and inserted after it does, the same as roles.
- **Cloudinary: `vhub/gallery/{userId}`, `image`, public delivery**, org-only signature — the same treatment as the flyer. **Never the credential path**, which is `raw`, private evidence.
- **The organisation profile gallery is automatic**, drawn from that org's PAST events, newest first, capped at 12. Curation was rejected: it needs another screen and organisations would not maintain it, so the section would sit empty. `organisation_profiles.show_gallery` (default TRUE, exposed through `public_organisation_profiles`) is the opt-out.
- **Every gallery surface renders NOTHING when empty** — no placeholder, no empty shell. Most outreaches will never have one.


