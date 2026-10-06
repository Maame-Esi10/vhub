# Admin phase (packages A to J) and account closure


## Private documents (admin phase package B, built 2026-08-25)

**A credential document is a private Cloudinary asset and the database stores its NAME, never its address.** `volunteer_profiles.credential_document_id` holds the `public_id`; the old `credential_document_url` column is **dropped**.

- **Why it changed.** The upload was signed but never marked private, so credentials were ordinary public-delivery assets and the permanent URL sat in a column. Anyone holding that string could fetch someone's identity document — no session, no check, nothing to revoke. Nothing real was ever exposed (test PDFs only); this closed the gap before the review queues brought real documents in.
- **`deliveryType` is the axis that decides privacy**, separate from `resourceType`. Credentials are `authenticated`; avatars, flyers and gallery images stay `upload` deliberately — they are shown to other users on screens with no session behind the image request.
- **`type` is in the SIGNED upload parameter set**, so a device cannot downgrade a credential to public delivery. It is **omitted** when the value is `upload`, because Cloudinary's default is `upload` and sending it would change the hash for the three public kinds and break uploads that work today. Client and server must stay in step.
- **`/api/document-url` is the only way to read one.** It authorises, then mints a link that dies in fifteen minutes. Access rules, enforced at the API and never in the UI: the volunteer themselves, always; an admin, for the Gate 1 review; an organisation **only if that volunteer has applied to one of its outreaches**; nobody else. A refusal is a flat 403 with the same wording whatever the reason — distinguishing "no document" from "not yours" would confirm to a stranger that a particular person uploaded one.
- **It uses Cloudinary's private-download endpoint, not a signed delivery URL.** A signed delivery URL (`/s--abc--/`) authenticates but never expires, which is the problem being fixed. `expires_at` sits inside the signed parameter set, so Cloudinary refuses the link itself afterwards and nothing on our side has to remember to revoke it.
- **Never store, cache or log a signed link.** `useDocumentUrl`'s `gcTime` is set to the link's own lifetime for that reason.

## Admin role (admin phase package A, built 2026-08-25)

The plan of record is `docs/ADMIN_PHASE_PLAN.md` — order, prerequisites and traps. Package A is the shell and the audit trail. **Packages B through J are ALL BUILT** (2026-08-25 to 2026-08-26) and each has its own section below; this line used to say they were not, and was left behind when they shipped.

- **`admin` is a third value of `profile_role`.** Adding it needs its OWN migration paste (`20260825a`), because a new enum value cannot be USED in the transaction that adds it and the Supabase editor wraps a paste in one transaction. Everything referencing `'admin'` is paste 2 (`20260825b`). **Every future admin migration that adds an enum value follows the same two-paste rule.**
- **Creation is database-only, enforced by the database.** Register as a normal user, then `update profiles set role = 'admin' where email = ...` in the SQL editor. There is no invite, no promotion screen, no "Sign up as Admin", and `profiles_insert_own` refuses a client-inserted admin row outright. In TypeScript, `SignupRole = Exclude<ProfileRole, 'admin'>` types every registration path, so an attempt to sign someone up as admin fails to compile.
- **An admin has NO child profile row** — no `volunteer_profiles`, no `organisation_profiles`. `resolveProfile` returns early for them; without that it would repair a volunteer row into existence and the onboarding-incomplete rule (category is null) would strand them on the welcome screen forever.
- **Role → route lives in `lib/roleRoutes.ts`**, read by `useAuthGuard` and by all three tab layouts. Each layout's defence-in-depth redirect sends a wrong-role user to THEIR OWN home. It used to send them to "the other group", which with three roles is a guess — and a wrong guess is two layouts redirecting into each other.
- **`admin_actions` is built BEFORE the features it records**, and every admin write from the first one onwards inserts a row. Insert-only on the service-role key; a trigger refuses UPDATE and DELETE from every role including the API, so a correction is a NEW row. The client may only SELECT, and only if `is_admin()`.
- **`is_admin()` is the single role test** — `security definer` with a pinned `search_path`, same reasoning as `is_related_via_application` (a policy on `profiles` that reads `profiles` recurses, 42P17).
- **No admin designs exist in `design-refs/`.** The admin screens reuse the existing visual language deliberately; do not invent a third look.
- **`supabase/migrations/20260825c_admin_lock_test.sql` is a TEST, not a migration.** It impersonates a signed-in client and proves the four locks hold. Success = silence; any failure raises and names the lock.

## Organisation verification (admin phase package C, built 2026-08-25)

`organisation_profiles.verification_state` is the truth: `unverified` → `documents_submitted` → `verified`, plus `rejected`, `suspended`, `banned`.

- **`verified` is a STORED GENERATED COLUMN** derived from it, and therefore unwritable by anyone including the service role. Eight places read the boolean; deriving kept every one working while the state became the truth. **Never try to write `verified`** — set `verification_state`.
- **`suspended` and `banned` exist in the enum but are NEVER SET.** They were added in package C expecting moderation to use them; package F deliberately did not - see the moderation section for why. They cannot be removed (Postgres has no drop-enum-value) and cost nothing.
- **Registration numbers are a table** (`organisation_registrations`), not four columns: the schemes are open-ended. No uniqueness across organisations — two branches of one NGO can legitimately quote the same parent registration.
- **`organisation_documents` stores the Cloudinary public_id**, private, read only through `/api/document-url`. The organisation itself and admins; **not** volunteers, not even ones who applied.
- **Only a verified organisation may publish**, enforced by `trg_outreaches_require_verified_org` — a trigger, not a disabled button. **Drafts are deliberately still allowed**: nothing about a draft is visible to anyone, and an organisation waiting on review must be able to prepare.
- **`official_email` is not `contact_email`.** The first is evidence (an address on the org's own domain); the second is the public enquiries address and may be a free webmail. Neither replaces the other.
- **The written reason is required for BOTH outcomes.** A rejection's reason is sent verbatim to the organisation so it knows what to fix; an approval's reason is how a later admin sees why thin evidence passed.
- **A resubmission REPLACES both child tables.** Appending would leave a withdrawn registration in the reviewer's list as though it were still claimed.

## Credential review — the two gates (admin phase package D, built 2026-08-25)

- **Gate 1 is the ADMIN's, platform-wide**: is the document real, legible, unexpired, and does it plausibly match the claimed category? Approve moves `documents_pending` → `verified`. It is explicitly **not** a competence judgement, and `/api/credential-review` is deliberately incapable of expressing one — no score, no note about skill.
- **Gate 2 is the ORGANISATION's, per application**: should THIS person do THIS clinical role for US? It reads the same document through `/api/document-url` and **changes no platform status at all**, which is why it has no endpoint and no approve/reject. It appears on the applicant card for anyone whose status is not `unverified`.
- **A rejection sets `unverified`, and there is deliberately NO `rejected` status.** A declined volunteer IS unverified — that is the state they are in and the thing they can act on; a fourth enum value would need its own migration paste, a branch in every screen that reads the status, and would mean "unverified, and also we are cross about it". What they need is `volunteer_profiles.verification_reason`, which the verification screen shows.
- **The document is KEPT on a rejection.** Destroying it would leave the volunteer unable to see what they sent and would erase the evidence behind a decision just recorded in the audit trail.
- **The decision re-asserts `documents_pending` in its WHERE clause**, not just in a prior read: between the read and the write the volunteer can withdraw the document, and the update must become a no-op rather than a decision about something no longer there.
- **`profiles` and `volunteer_profiles` SELECT policies gained `or is_admin()`.** Without it the queue is empty for the only person meant to see it, while the endpoint's own service-role reads keep working — a half-working state that costs a session to diagnose.

## Document consent and guidelines (admin phase package E, built 2026-08-25)

- **Consent is REFUSED, not assumed.** `volunteer_profiles.document_consent_at` / `organisation_profiles.document_consent_at` are server-only; both upload endpoints reject a document when the column is null and the request carries no fresh agreement. A checkbox proves nothing once the form closes — the timestamp is the evidence, and it is written in the same statement as the document, so consent can never exist for an upload that did not happen.
- **Nobody was backfilled.** Everyone holding a document from before the text existed uploaded it without seeing it; recording their agreement would be untrue. They are asked once, on their next upload.
- **Asked once, then never again.** Re-showing it on every replacement trains people to tap past it.
- **`constants/credential-guidelines.ts` is the single source** for the per-category guidance, the general rules and both consent texts. The guidelines screen and the consent block both read it, so they cannot tell a volunteer different things about the same document.
- **NO real or sample credential images, ever.** A sample licence is either somebody's real one or a forgery template with our name on it. Illustrations are generic icons.
- **Named councils are examples, not a closed list** — each entry says "or the equivalent from wherever you are registered".

## Moderation (admin phase package F, built 2026-08-25)

**Governing principle: suspension stops FUTURE activity and never rewrites the past.** Attendance stays recorded, reviews stay written, V-Scores keep meaning what they meant.

- **`profiles.moderation_state` (`active`/`suspended`/`banned`) is SEPARATE from `organisation_profiles.verification_state`.** This is a deliberate **departure from `docs/ADMIN_PHASE_PLAN.md`**, which folded suspension into the verification state. Suspending a verified organisation would overwrite the column recording that we checked their documents, and reinstating could not restore it without storing the previous value somewhere - the exact "a value that must agree with something else will disagree with it" problem the plan warns about elsewhere. They are independent facts. Being on `profiles` also means ONE implementation covers both roles. The two enum values stay in `org_verification_state`, unused; Postgres cannot remove an enum value.
- **The consequences are asymmetric, because the roles hold different things.** An organisation holds other people's Saturdays: its `open`/`closed` outreaches are cancelled and everyone accepted, waitlisted or pending is told by push **and email**. A volunteer holds a place someone else could have had: their live applications are withdrawn and each **accepted** place goes to the waitlist through the same promotion their own cancellation uses.
- **Only an ACCEPTED place frees a seat.** Promoting against a withdrawn pending or waitlisted application would accept somebody into a slot that is still legitimately full.
- **Reinstatement restores future activity ONLY.** It does not resurrect cancelled outreaches or withdrawn applications: the people affected were told those were off, and quietly un-telling them later is worse.
- **`server/waitlist.ts` is the ONE promotion rule**, extracted from `/api/application-status` unchanged so moderation reuses it. Two copies would drift, and the drift would be invisible because both would still "work".
- **Two database triggers, not disabled buttons**: a suspended organisation cannot create or publish (no draft exception - a suspended org has been told to stop, unlike one awaiting review), and a suspended volunteer cannot apply. The application trigger is **INSERT only** on purpose: an UPDATE by a suspended volunteer is them cancelling, and a suspended person must always be able to withdraw.
- **An admin cannot moderate themselves** (they could not undo it) and **cannot moderate another admin** (that is governance, and lives in the database with admin creation).
- **Moderation is SEARCH, never a browsable directory** - it starts with a complaint about a specific person, and a roll of every account invites looking through people for its own sake.
- **`ModerationBanner` renders on both home screens**, because a suspension the account cannot see is indistinguishable from the app being broken.

## Disputes (admin phase package G, built 2026-08-26)

A volunteer can challenge two things, and only two, because they are the two that cost them something they cannot otherwise get back: **being marked absent when they say they were there**, and **a review they believe is unfair**.

- **UPHOLDING NOW MOVES THE SCORE** (changed 2026-08-26, when the V-Score reversal was approved — see the V-Score section). The disputed event is **voided**: it stops counting at all, and every event after it is replayed on top of that. Voiding rather than substituting a better rating is the whole design — upholding says "this record should not have counted against you" and says nothing about what the ratings should have been, and inventing one would be exactly the fabrication the removed midpoint constant was. A **rejected** dispute moves nothing, which is right: nothing about the history was found to be wrong.
- **It still does not flip the attendance row or rewrite the review.** Only an upheld ATTENDANCE dispute changes `events_attended`, and it does so by making the replay count that event as attended — not by editing the record.
- **The record is never overwritten by a conclusion about it.** Editing the attendance row was considered and rejected for the same reason it is service-role-only: that row is the evidence a score is derived from. The dispute sits *beside* the record, not on top of it.
- **Raising is a plain client insert; resolving is an endpoint.** Nothing about raising needs a secret, and `status` / `resolution` / `resolved_by` are withheld by the grant list — the worst a crafted call can do is file a dispute the caller was always entitled to file.
- **A volunteer cannot WITHDRAW a dispute** (that would need `status` in the grant list, which would also let them mark it upheld). They can edit the statement while it is open; an admin can reject one no longer being pursued. `withdrawn` exists in the enum for a future endpoint and is set by nothing.
- **One OPEN dispute of each kind per event**, enforced by a partial unique index so a resolved dispute never blocks a later, genuinely new one.
- **`attendance` and `event_reviews` SELECT policies gained `or is_admin()`** — without them the screen would show a statement with nothing to weigh it against.
- **Both parties are told, in the same words.** An upheld attendance dispute says the organisation's record was wrong; they need to know as much as the volunteer does.

## Privacy policy and terms (admin phase package H, built 2026-08-26)

- **`constants/policy.ts` is the text; `app/policy.tsx` is the screen.** One route OUTSIDE every role group, the same placement as `app/offline.tsx`: all three roles reach it, from three Settings screens and from the credential consent block, and three copies inside three groups would be three things to keep in step.
- **The auth guard treats `policy` as always-open**, signed in or not. Somebody deciding whether to register has the most reason of anyone to read it; bouncing them to welcome would be the app refusing to explain itself.
- **EVERY CLAIM IN THE POLICY MUST BE TRUE OF THE CODE.** If a claim stops matching what the app does, **the claim is the bug**. The location paragraph is the strongest privacy statement this project can make and it is true today: `/api/checkin` compares one reading against the venue and keeps the verdict, never the coordinates.
- **Plain language, no legalese**, per the brief — the readers are nurses and students, not procurement lawyers.
- `?tab=terms` opens on the terms, so a link meaning "read the terms" lands there rather than on privacy with an instruction to scroll.

## Account closure (owner-approved and built 2026-08-31)

**CLOSURE ANONYMISES AND REVOKES. IT NEVER DELETES.** `/api/account-closure`, reached from Settings → Account & Security on both roles, behind typing the word CLOSE. Immediate and irreversible — there is deliberately no grace period, because that needs a scheduled job, a "closing soon" state on every screen and a way to cancel, which is three moving parts for something a person does once.

- **Why it cannot be a delete.** Every table hangs off `profiles` with `on delete cascade`. Deleting an organisation cascades through its outreaches into OTHER people's attendance, reviews and disputes — and because a V-Score is derived by replaying `event_reviews`, every volunteer who ever worked for it would silently drift back toward 70 with a smaller `events_attended` and nothing on any screen to explain the drop. **If you ever delete a user from the Supabase dashboard, that is exactly what happens.**
- **`profiles.closed_at` is the record** (`supabase/migrations/20260908`). Server-only: it is not in any grant list, so a client can neither close somebody else's account nor reopen its own. **The existing cascades are deliberately left alone** — they defend a path the app no longer takes, and rewriting sixteen constraints would be risk for no gain.
- **The login is BANNED, not deleted.** `profiles.id` references `auth.users(id) on delete cascade`, so deleting the auth user would destroy everything above. `ban_duration: '876000h'` (verified present in `@supabase/supabase-js` 2.110.1) revokes access; the stored email is scrambled to a `.invalid` address in the same call, which stops password-reset recovery **and** frees the real address so the person can sign up again later as a new user.
- **The order is load-bearing: stop the future, destroy the evidence, anonymise, delete the plumbing, revoke the login.** Stopping comes first because those notifications name the person and the event and go to OTHER people. Revoking comes last, so a failure anywhere above leaves an account that can still be acted on.
- **What survives is decided by one test: is this a record of WORK, or of the PERSON?** Outreaches, applications, attendance, reviews, disputes and score events survive. Names, contact details, photos, biographies, skill lists, credential and organisation documents, registration numbers, push tokens and notifications do not. **`v_score` and `events_attended` are KEPT** — they are derived from the reviews being kept, so clearing them would leave the cache disagreeing with history.
- **NO V-SCORE PENALTY IS EVER APPLIED.** The withdrawals go through `server/accountStop.ts`, which writes to `applications` directly and never reaches `/api/application-status`'s cancellation deduction. Somebody leaving the platform is not abandoning an event, and a parting deduction on an account nobody will ever look at again would be spite.
- **`server/accountStop.ts` is the ONE stop rule**, extracted from `/api/moderation` unchanged so closure reuses it — the same call `server/waitlist.ts` got. Two copies would drift, and the drift would be invisible because both would still "work"; one would simply stop telling somebody their Saturday was cancelled.
- **An admin closes theirs in the SQL editor**, where admins are made. An admin closing themselves through the app could leave the platform with no administrator and every queue unreachable.
- **`closed_at is null` filters the places that treat a profile as a live person**: both public profile views (in the migration, because they are `security_invoker = false` and bypass RLS), the new-match notification pool, the under-subscription escalation pool, and both admin account searches.
- **The avatar's Cloudinary asset is orphaned, knowingly.** `avatar_url` stores a URL, not a `public_id`, so there is nothing to address a delete with. The column is cleared so it leaves every screen. Recorded in `docs/REPORT_NOTES.md` as a limitation rather than left to be discovered.
- **The privacy policy was rewritten to match**, per package H's rule that a claim which stops describing the code is the bug. It now says the person is removed, that records of work are kept with the name removed, and why.

## Platform statistics (admin phase package I, built 2026-08-26)

- **Each card answers ONE named question.** A number with no question attached is decoration: fill rate answers "does the matching work?", the no-show trend answers "does accountability work?", the backlog answers "is anybody waiting on me?" — and the backlog leads, because it is the only figure about the admin's own conduct.
- **Counted in the DATABASE where a count is all that is needed** (`head: true` + exact count returns a number and no rows). Only the fill rate and the trend fetch rows, two columns each and bounded.
- **Drafts and cancelled events are excluded from the fill rate.** A draft never recruited anybody and a cancelled event's empty places are not a matching failure; including either drags the rate down for reasons unrelated to matching.
- **Every month in the trend window is seeded, including empty ones** — a trend with quiet months missing reads as a line that jumped when nothing happened.
- **The bars are plain Views.** A charting dependency is gated, and six bars scaled to the largest is already a chart.
- **`outreaches` and `applications` SELECT policies gained `or is_admin()`.** Both are row-scoped and an admin owns nothing, so without it every count would come back quietly wrong rather than failing — and nobody checks a number that looks plausible.

## Vetted sources (admin phase package J, built 2026-08-26)

**SURFACE ONLY, and the screen says so.** Nothing reads `vetted_sources`, no listing is fetched from any of them, and no outreach is created from one. The ingestion feature behind it stays deferred; this records which sources *would* be acceptable, while the reasoning is fresh.

- **No `last_fetched_at`, no `active` flag, no schedule.** Columns that exist for a feature that does not are how a schema starts lying — a forever-null `last_fetched_at` reads as a broken fetcher rather than an absent one.
- **`url` is not validated as a URL** and `source_type` is free text: a district health directorate's noticeboard has no scheme, and the kinds of body are open-ended.
- **`rationale` is required.** A whitelist without reasons is a list somebody has to take on trust, and whoever approved each entry will not always be there to ask.
- **Add and remove both go through the endpoint**, so both write audit rows — and a removal reads the row first, because once it is gone the audit entry is the only record it existed.
- **The screen states that nothing is fetched.** An admin who added three sources and saw nothing happen would reasonably conclude the app was broken.


