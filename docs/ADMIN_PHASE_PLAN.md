# Admin Phase — Plan

**Status: THE WHOLE ADMIN PHASE IS BUILT (A through J, 2026-08-25 to
2026-08-26).** Written 2026-08-21 at the owner's request; kept as the record of
what was intended and why, alongside the notes below on where the build
departed from it. The one item still gated and NOT built is the V-Score
reversal, which was always its own approval gate.

**Two deliberate departures, both argued in CLAUDE.md and
`docs/REPORT_NOTES.md`:**

1. **Moderation is its own column on `profiles`, not part of
   `org_verification_state`** (package F). Folding suspension into the
   verification state would make suspending a verified organisation erase the
   record that its documents were checked, with nothing to restore it from.
2. **There is no `rejected` volunteer verification status** (package D). A
   declined volunteer is unverified; what they need is the reason, which is a
   column, not a fourth enum value with a branch in every screen.

The source of truth for *what* is wanted is the owner's 12-section brief of
2026-08-11. This document is the *how*: the order, the prerequisites, what each
piece touches, and the traps that will otherwise be discovered mid-build.

Every screen is shown for approval before it is committed. Every V-Score change
stays gated. Nothing in section 8's V-Score reversal is built without a separate,
explicit yes.

---

## Two things that are already true, and change the order

### 1. Credential documents are NOT private today

Section 6(a) — private storage with short-lived signed URLs — is described in the
brief as the single most important technical requirement. The current state does
not meet it:

- `api/src/server/cloudinary.ts` signs the **upload**, but sets no `access_mode`
  or `type`, so credential assets land as ordinary public-delivery `raw` files.
- `volunteer_profiles.credential_document_url` stores the **permanent**
  `secure_url` returned by that upload.
- `app/(volunteer)/verify-identity.tsx` opens that URL directly with
  `Linking.openURL`.

So anyone holding the URL string can fetch the document, with no session and no
authorisation check. **Verify this against the Cloudinary console before
building** — the plan should not rest on a reading of the code alone.

**Nothing has been exposed.** The owner confirmed on 2026-08-21 that **no real
credential document has ever been uploaded to this app**: everything in the
credentials folder is test PDFs she uploaded while exercising the upload flow. No
volunteer's licence or ID has been at risk at any point.

That distinction matters for how this is treated. It is a **gap to close before
real documents arrive**, not a breach to remediate — no notification duty, no
audit of who fetched what, no migration of assets worth preserving. What remains
is ordinary engineering with a deadline attached to it: packages C and D are what
cause real documents to be uploaded at volume, so the fix lands before them.

**Consequence for the order: section 6(a) moves to the front, before the two
features that cause documents to be uploaded and reviewed at volume.** This is
the owner's own principle from the brief, "do document privacy before any real
documents are uploaded", read literally: the moment real ones start arriving is
the moment packages C and D ship, so the fix has to land before them rather than
after.

### 2. The role enum cannot be extended and used in one paste

`profile_role` is a Postgres `enum ('volunteer','organisation')`. Adding `'admin'`
is `alter type profile_role add value 'admin'`, and **a new enum value cannot be
USED in the same transaction that adds it**. The Supabase SQL editor wraps a
pasted script in one transaction, so a single migration that adds the value and
then writes a policy referencing `'admin'` will fail.

**Every admin migration therefore ships as two separate pastes**, run one after
the other:

```sql
-- PASTE 1, on its own, nothing else in it
alter type profile_role add value if not exists 'admin';
```

```sql
-- PASTE 2, only after paste 1 has committed
-- everything that references 'admin': policies, grants, helper functions
```

This is the same class of trap as the editor gotchas already recorded in memory,
and it will cost a session if it is found at the keyboard.

---

## Proposed order

The owner proposed 3 and 4 first, then 6, then 5, 9, 8, 7, 11, 10, and invited
disagreement with reasons. Two changes, both argued above and below:

| # | Package | Why here |
|---|---|---|
| **A** ✅ | §1 admin role + `(admin)` group + §12 audit trail | **BUILT 2026-08-25.** Hard prerequisite. Nothing else can be built or tested without an admin to be. |
| **B** ✅ | §6(a) private documents + signed URLs | Moved BEFORE the review queues, which are what bring real documents in. Nothing real has been exposed; the path is simply not private yet. |
| **C** ✅ | §3 organisation verification | The blocking half of the trust chain. |
| **D** ✅ | §4 volunteer credentials, Gate 1 | The other blocking half; closes the "verified without applying anywhere" gap. |
| **E** ✅ | §6(b)(c) access control + consent, §5 guidelines | Finishes the document story around the queues that now exist. |
| **F** ✅ | §9 moderation | Needs verification states to exist first. |
| **G** ✅ | §8 disputes, WITHOUT V-Score reversal | Ships against the current V-Score model. See below. |
| **H** ✅ | §7 privacy policy + terms | Content, once the behaviour it describes is real. |
| **I** ✅ | §11 stats | Reads everything above. |
| **J** ✅ | §10 vetted sources, surface only | Genuinely last; the feature behind it stays deferred. |

**Why §12 is not last.** Security and the audit trail are listed twelfth in the
brief but cannot be built after the actions they record — an admin write shipped
without an audit row is a decision with no evidence behind it, and backfilling
history is impossible. The audit table is built in package A, and **every admin
write from the first one onwards inserts into it**.

---

## Package A — the admin role and the shell

**Database**
- Paste 1: `alter type profile_role add value if not exists 'admin'`.
- Paste 2: an `admin_actions` audit table — actor, timestamp, target type + id,
  action, reason, optional payload. Insert-only for the service role; readable by
  admins; **no client insert path at all**.
- A `is_admin()` helper (`security definer`, reads `profiles.role`) for policies
  to call, so the role test lives in one place.
- Confirm the existing role-immutability lock still refuses a client setting its
  own `role`, now that `'admin'` is a legal value. **This must be tested, not
  assumed** — the lock predates the new value.

**App**
- `app/(admin)/` route group with its own tab navigator.
- `hooks/useAuthGuard.ts` learns a third home route. Today it branches
  volunteer/organisation in several places; the admin branch goes in the same
  spots, and an admin landing in `(volunteer)` or `(organisation)` is bounced the
  same way those two already bounce each other.
- **Welcome screen must not offer "Sign up as Admin"**, and there is no special
  URL. An admin signs in on the same screen as everyone else and is routed by
  role.

**Creation is database-only.** Register normally, then `update profiles set role
= 'admin' where id = ...` on the service role. No invite flow, no in-app
promotion, ever.

**Risk to watch:** the auth guard is the single most load-bearing hook in the
app and has been the source of two previous traps (the wizard hijack, the
back-out loop). Change it in one commit, with the existing behaviour for the two
current roles untouched and re-tested.

### What package A actually shipped, 2026-08-25

Everything above, plus two things the plan did not anticipate and one it asked
for and got an answer to.

**The role-immutability check found a real hole, in the INSERT rather than the
UPDATE.** The UPDATE lock holds — `role` is absent from the client's grant list.
But the profiles row is INSERTED by the client at signup, and
`profiles_insert_own` only checked `auth.uid() = id`, so the role in that insert
was always the client's to choose. Harmless while the only options were the two
roles anyone can register as; a working privilege escalation the moment `'admin'`
became legal. The with-check now carries `and role <> 'admin'`, and
`SignupRole = Exclude<ProfileRole, 'admin'>` types every registration path so the
same mistake cannot be made in TypeScript either. **This is exactly why the plan
said to test rather than assume.**

**Two roles hid a routing assumption.** `role !== 'volunteer'` meant
"organisation" in three places. In `resolveProfile` that would have given an
admin an `organisation_profiles` row and then a repaired `volunteer_profiles` row
on every load, stranding them on welcome forever (category null =
onboarding incomplete). In the two tab layouts it meant a wrong-role user was
redirected to "the other group", which with three roles is a guess — and two
layouts guessing wrong redirect into each other. Role → home route and role →
group now live in `lib/roleRoutes.ts`, read by the auth guard AND all three
layouts, with four unit tests on the properties a fourth role would break.

**Files:** `supabase/migrations/20260825a_admin_role_enum.sql` (paste 1),
`20260825b_admin_actions.sql` (paste 2), `20260825c_admin_lock_test.sql` (a test,
not a migration), `supabase/schema.sql`, `lib/roleRoutes.ts`,
`hooks/useAdminActions.ts`, `app/(admin)/` (`_layout`, `overview`, `activity`,
`settings`, `account-security`), `hooks/useAuthGuard.ts`, both existing tab
layouts, `types/database.ts`, `lib/auth-metadata.ts`.

**Deliberately not built:** queue-count tiles on the admin home. There is no
queue yet, and "0 pending" implies one exists.

---

## Package B — private documents

The requirement: credential and organisation documents are stored as private
Cloudinary assets and viewed **only** through short-lived signed URLs generated
server-side, for a requester the server has just authorised. No permanent URL is
ever stored or returned.

**Work**
1. Upload signing sets the asset private (`type: 'authenticated'`) for the
   credential and organisation-document kinds. The flyer, gallery and avatar
   paths are public by design and must not change.
2. Store the **`public_id`**, not the URL. `credential_document_url` becomes
   `credential_document_id` (or gains a sibling and the URL column is retired) —
   a stored URL is the thing that leaks.
3. A new endpoint, `/api/document-url`, that: authenticates, decides whether this
   requester may see this document under the §6(b) rules, and returns a signed
   URL valid for minutes.
4. The verification screen and both admin queues fetch through it. Nothing
   renders a document from a stored string again.

**Existing assets: delete them (owner's decision, 2026-08-21).** They are test
PDFs, so there is nothing to preserve and no volunteer to notify. Delete the
Cloudinary assets and clear `credential_document_url` (and
`verification_status` back to `unverified`) on any row pointing at them.

**Confirm what is actually in the folder first**, from the Cloudinary console,
rather than deleting on the strength of an assumption about what should be there.
If anything unexpected has landed in `vhub/credentials/`, stop and report it
before removing anything.

Order matters: do the deletion **after** the private-upload path is in place, so
a re-upload during testing lands as a private asset rather than recreating the
problem.

**Access rules (§6(b)), enforced at the API, not the UI**
- A volunteer sees their own documents, always.
- An organisation sees a volunteer's credential **only** if that volunteer has
  applied to one of that organisation's outreaches.
- An admin sees organisation documents and credentials, for the Gate 1 check.
- Nobody else, by any path.

---

## Package C — organisation verification

**Deliberately lightweight.** No type-specific certificate rules, no external
registry checks. An admin makes a reasonable human judgement.

**Schema**
- `organisation_registrations` — many per organisation: label + number. Must be
  many, not a fixed set of columns; the brief names four example schemes and the
  form has to accept others.
- `organisation_documents` — many per organisation, private, same treatment as
  credentials.
- `organisation_profiles` gains: official email (on the org's own domain, not
  free webmail), website, physical address, named contact person, and a
  verification **state**: `unverified` → `documents_submitted` → `verified`, plus
  `rejected`, `suspended`, `banned`. The existing boolean `verified` is derived
  from it or replaced by it — **decide explicitly**, because `verified` is
  already read in several places and is service-role-only today.

**Queue** — oldest first, one card per organisation, everything submitted shown,
tap a document for full-screen pinch-to-zoom, approve or reject with a written
reason. Rejection notifies the organisation with the reason so it can resubmit.
Every decision writes an `admin_actions` row.

**The block that must be real:** only verified organisations may post outreaches
or review volunteer credentials. **Block the actions at the database**, not with
a disabled button — the same standard the clinical gate is held to.

---

## Package D — volunteer credentials, Gate 1

**Gate 1 is a basic check, platform-wide:** is the document real, legible,
unexpired, and does it plausibly match the claimed category? It is explicitly
**not** a clinical-competence judgement.

- Approve → `documents_pending` becomes `verified`.
- Reject → notify with the reason so they can resubmit.
- Both write `admin_actions`.

This closes the gap that exists today: a volunteer can currently reach
`documents_pending` and stop there forever, because nothing in the app can
advance them and approval is a manual SQL statement.

**Gate 2 is the organisation's clinical judgement**, per application, and does
**not** change platform verification status. An organisation considering someone
for a clinical role can view the credential (through the signed-URL endpoint,
under the §6(b) rule) and make its own call. The existing clinical-role gate is
unchanged; support roles stay ungated.

---

## Package E — consent, and the guidelines page

- **Consent at the point of upload**, in plain language, separate from general
  terms: what is uploaded, why, who can see it, that it is used only for
  verification. The volunteer actively agrees; the agreement is recorded.
- **Guidelines page** with per-category instructions and simple generic
  illustrations (§5 lists the exact wording per category). General rules for
  everyone: legible, name visible, unexpired, JPG/PNG or PDF. **No real or sample
  credential images.**

---

## Package F — moderation

**Governing principle: suspension stops FUTURE activity and never rewrites the
past.** Both suspend (reversible, the default) and ban (permanent) need a recorded
reason and an audit entry.

- **Organisation** → open outreaches cancelled, accepted volunteers notified by
  email and push; cannot post or review credentials; past events, attendance and
  reviews preserved.
- **Volunteer** → pending applications withdrawn; accepted places released back,
  which triggers the **existing** automatic waitlist promotion so the
  organisation is not left short; past attendance and reviews preserved.
- **Unsuspending restores future activity only.** It does not resurrect cancelled
  outreaches or withdrawn applications.

Reuses machinery that already exists: outreach cancellation, the waitlist
promotion in `/api/application-status`, and the notification fan-out.

---

## Package G — disputes, and the V-Score question

Volunteers dispute two things: marked absent when they say they attended, or a
review they believe is unfair. The admin view shows both sides objectively —
attendance disputes show the full record (did they scan? what did the silent
location validation return? what did the organisation mark?) plus the
volunteer's statement; review disputes show the review, the statement and the
aggregate history. Admin upholds or rejects with a recorded reason; both parties
are notified.

**Disputes CAN ship against the current V-Score model**, and should. An upheld
dispute records the correction and notifies both parties; what it does to the
score is the separate question below. Nothing about the queue, the evidence view
or the decision depends on how the score is stored.

### The V-Score reversal — its own approval gate, not part of this package

This is the only item in the whole brief that changes something already built,
working and tested, so it is planned separately and built only on an explicit yes.

**The proposal:** on an upheld dispute, mark the event's outcome corrected and
**recompute the V-Score from full event history — start at 70 and replay every
event chronologically** — making the V-Score a derived value rather than a stored
running total.

**Why it is better design regardless:** it is auditable, it is correctable, and
the volumes are small. Today the score is a running total with no way back; one
wrong review is permanent.

**What it would change, to be reported in full before any approval:**
- **Storage** — `volunteer_profiles.v_score` becomes a cache of a derived value
  rather than the truth.
- **Computation** — a replay function, plus a definition of what counts as an
  event in the history and in what order.
- **Migration** — every existing score is recomputed. Some will move, and the
  report must say by how much before it is run.
- **Breakage risk** — the reliability multiplier, the bands, the ranking, and
  every screen showing a score all read this value.
- **Re-testing** — the whole V-Score suite plus the ranking tests.

**And it must not be wired while the penalty path is still inert.** The owner's
standing decision of 2026-08-21 holds: penalties stay uncalled until everything
is device-tested, because a bug that has already written to reputation data is an
audit-and-repair job rather than a code fix.

---

## Packages H, I, J — briefly

- **§7 privacy policy and terms**, plain language, no dense legalese. Must state
  that **location at check-in is checked once at the scan solely to compare
  against the venue and is never stored as a movement record** — that is already
  true in the code and is the strongest privacy claim the project can make.
  Surfaced from Settings and linked at credential upload.
- **§11 stats**, mobile-appropriate: counts by status, **fill rates** (does
  matching work), **no-show trends over time** (does accountability work),
  verification backlog. A few large legible numbers on scrollable cards.
- **§10 vetted sources, surface only** — add/remove/view a whitelist, each with
  name, URL/domain, type and why approved. **No ingestion.**

---

## Ground rules that apply throughout

- **Mobile-first.** Admin lives on a phone. One item per card, tap for detail,
  documents **full-screen with pinch-to-zoom** (needed to read a licence number
  off a photo), actions within thumb reach.
- **No admin designs exist in `design-refs/`.** Say so, build in the existing
  visual language, and show each screen for approval before committing.
- **Every admin write goes through a service-role endpoint**, following the
  `v_score` and `verification_status` precedent. **Never fix an admin write
  failure by widening a client grant.**
- **Every admin action writes an audit row** — actor, timestamp, target, action,
  reason.
- **Documentation duty:** log decisions in `docs/REPORT_NOTES.md` and update
  `CLAUDE.md` for the admin role and its database-only creation rule,
  organisation verification, the two-gate credential model, document privacy and
  the signed-URL requirement, the V-Score-as-derived change if approved, and the
  moderation consequence rules — so `qa-reviewer` does not flag drift.

---

## How `organisation_profiles.verified` is derived

**Decided 2026-08-21: derive it from the new state column and keep it.** Replacing
it would mean touching every reader at once and risking a miss; deriving keeps
every existing reader working while `verification_state` becomes the truth, and
the boolean can be dropped later once nothing reads it.

**What derives it: a STORED generated column.**

```sql
-- PASTE 2 territory (it references the new enum), and the view has to go first
-- because a column cannot be dropped while a view selects it.
drop view if exists public_organisation_profiles;

alter table organisation_profiles drop column verified;
alter table organisation_profiles
  add column verified boolean
  generated always as (verification_state = 'verified') stored;

-- then recreate public_organisation_profiles exactly as it was; it selects
-- op.verified and does not need to change.
```

A trigger would also work and is more forgiving, but a generated column is the
right instrument for the same reason CLAUDE.md already gives about the multi-role
flag: **a boolean that must agree with something else will eventually disagree
with it** unless the database is the one computing it. Generated is the version
that cannot drift.

**The consequence to design around: nothing may write `verified` ever again.**
Postgres rejects a write to a generated column. Today the column is service-role
only — absent from every client grant — so the only writers are server-side, and
they all move to setting `verification_state`. That is a strict improvement:
approval becomes one write to one column with one meaning.

**Where it is read** (all keep working untouched):

| Reader | What it does |
|---|---|
| `app/(organisation)/settings.tsx` | "Verified" / "Awaiting verification" on the identity block, and the Organisation Verification row |
| `app/(organisation)/edit-profile.tsx` | the badge and its icon |
| `app/profile/organisation/[id].tsx` | the public "Verified organisation" badge |
| `public_organisation_profiles` (view) | exposes `op.verified` to volunteers |
| `api/.../match/route.ts` | selects it inside the organisation embed |
| `lib/api-client.ts`, `types/database.ts` | the two type declarations |

Eight sites across the app, the API, a view and two type files — which is exactly
why deriving beat replacing.

## Decisions — all four confirmed 2026-08-21

1. **Existing credential documents: delete them.** Test PDFs only; nothing real
   has ever been uploaded. Confirm the folder contents in the Cloudinary console
   first, and delete after the private path exists.
2. **`verified` is derived and kept**, as a stored generated column — see above.
3. **Both order changes confirmed**: §6(a) before the review queues, audit trail
   in package A.
4. **V-Score reversal stays outside package G**, its own approval gate, with the
   full report on storage, computation, migration, breakage risk and re-testing
   before a yes is asked for. Disputes ship against the current model.

**Also confirmed:** the two-paste enum rule applies to every admin migration that
adds a role value — the same constraint already hit with `not_selected` and
`cancelled`.
