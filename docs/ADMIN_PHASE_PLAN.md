# Admin Phase — Plan

**Status: PLAN ONLY. Nothing here is built.** Written 2026-08-21 at the owner's
request, so the next session can start work without rebuilding context.

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
authorisation check. **Verify this against the Cloudinary console before building**
— the plan should not rest on a reading of the code alone — but if it holds, this
is a live privacy gap, not a future one, and real documents may already exist
(the verification flow shipped 2026-08-20 and has been device-tested since).

**Consequence for the order: section 6(a) moves to the front, before the two
features that cause documents to be uploaded and reviewed at volume.** This is
the owner's own principle from the brief — "do document privacy before any real
documents are uploaded" — applied to the fact that some already are.

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
| **A** | §1 admin role + `(admin)` group + §12 audit trail | Hard prerequisite. Nothing else can be built or tested without an admin to be. |
| **B** | §6(a) private documents + signed URLs | Moved BEFORE the review queues. Documents already exist and are currently fetchable by URL. |
| **C** | §3 organisation verification | The blocking half of the trust chain. |
| **D** | §4 volunteer credentials, Gate 1 | The other blocking half; closes the "verified without applying anywhere" gap. |
| **E** | §6(b)(c) access control + consent, §5 guidelines | Finishes the document story around the queues that now exist. |
| **F** | §9 moderation | Needs verification states to exist first. |
| **G** | §8 disputes, WITHOUT V-Score reversal | Ships against the current V-Score model. See below. |
| **H** | §7 privacy policy + terms | Content, once the behaviour it describes is real. |
| **I** | §11 stats | Reads everything above. |
| **J** | §10 vetted sources, surface only | Genuinely last; the feature behind it stays deferred. |

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

**Migration of existing rows.** Whatever documents already exist were uploaded
public. They cannot be made private by a database change alone — the asset has to
be moved in Cloudinary or re-uploaded. Smallest honest option: mark existing
credentials as needing re-upload and tell those volunteers, since the volume is
tiny (single figures). **Decide this with the owner rather than silently
migrating or silently leaving them public.**

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

## What to decide before building starts

1. **Existing public credential documents** — re-upload, migrate in Cloudinary,
   or leave. Needs a decision; do not choose silently.
2. **`organisation_profiles.verified`** — replaced by the new state column, or
   derived from it and kept for compatibility.
3. **Order** — confirm the two changes argued above: §6(a) before the queues, and
   the audit trail built in package A rather than last.
4. **V-Score reversal** — stays gated, and stays out of package G unless
   separately approved after its own report.
