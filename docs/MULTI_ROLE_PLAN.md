# Multi-role outreaches — plan and SQL

**Status: APPROVED 2026-08-11. Built and deployed; device test outstanding.**

| Piece | State |
|---|---|
| Migration (`supabase/migrations/20260811_multi_role_outreaches.sql`) | **Run 2026-08-13** (role_rows 0, total_outreaches 4) |
| Pure scorer (`lib/matching/multiRole.ts`) + 21 unit tests | Built, passing |
| `/api/match` role-aware scoring | Built, **deployed 2026-08-15** |
| Screens (wizard role builder, detail apply-per-role, applicant grouping) | Built, device test pending |

**One change from the original proposal, at the owner's push-back.** The
uniqueness rule was `unique (outreach_id, category)`, which permanently ruled
out "1 experienced nurse to lead, 4 nurses of any level" — a realistic
staffing pattern. It is now a unique **index** over
`(outreach_id, category, coalesce(min_experience_level, 'any'))`, plus
`min_experience_level` with **"this level or above"** semantics.

The `coalesce` is not cosmetic. A plain
`unique (outreach_id, category, min_experience_level)` would let an
organisation create two separate "nurse, any level" rows, because
`min_experience_level` is NULL for "any" and **NULL never equals NULL in a
unique constraint**. Coalescing to a real `'any'` value makes it deduplicate.
And the minimum must be a floor rather than an exact match, or a 4-slot "any
level" role could not accept an experienced nurse — absurd, and it would defeat
the very pattern the change was made for.

Requested 2026-08-11: an outreach should be able to specify role slots — "2
doctors, 3 nurses, 5 students" — instead of a single `required_category`.

**The hard constraint that shapes everything below:** an organisation that just
needs "any 10 volunteers" must keep posting exactly as it does today. This is an
addition, not a replacement.

---

## 1. Why the obvious design is wrong

The tempting change is to make `outreaches.required_category` plural —
`required_categories text[]`. It is a one-line migration and it is wrong,
because an array cannot say *how many of each*. "Nurses and doctors, 10 slots"
is satisfied by 10 nurses and no doctor. The whole point of the request is the
per-category count, so the count has to live somewhere a constraint can defend
it.

A `jsonb` column on `outreaches` was the second candidate. Rejected: an
application cannot carry a foreign key into a JSON blob, per-role slot limits
cannot be enforced by a check constraint, and every read would parse JSON in
application code. The per-role slot cap is exactly the kind of rule that must be
enforced by the database, because `slots_filled <= slots_total` already is.

**Chosen design: a child table, `outreach_roles`**, with `applications` pointing
at the specific role applied for.

---

## 2. Schema

### 2.1 New table

```sql
-- ============================================================
-- outreach_roles — the per-category slot breakdown of an outreach.
--
-- An outreach has EITHER zero rows here (single-role mode: the legacy
-- outreaches.required_category / role_type / slots_total describe it, and
-- nothing changes for the organisations already posting that way) OR one row
-- per professional category it wants (multi-role mode).
--
-- The two modes are distinguished by `exists (select 1 from outreach_roles
-- where outreach_id = o.id)` and by nothing else. There is deliberately no
-- `outreaches.is_multi_role` flag: a boolean that must agree with the presence
-- of child rows is a second source of truth and will eventually disagree.
-- ============================================================
create table if not exists outreach_roles (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,

  -- Same vocabulary as volunteer_profiles.category.
  category text not null check (category in (
    'doctor','nurse','midwife','pharmacist','student','first_aider','other'
  )),

  -- Per-role, NOT per-outreach. This is what lets one outreach ask for 2
  -- clinical doctors and 5 support-role students, and it is what the
  -- verification gate keys off (section 4).
  role_type text not null check (role_type in ('clinical','support')),

  -- Optional per-role skill requirement. Null means "inherit the outreach's
  -- required_skills", so an organisation that wants one skill list for the
  -- whole event does not have to repeat it on every role.
  required_skills text[],

  slots_total int not null check (slots_total > 0),
  slots_filled int not null default 0 check (slots_filled >= 0),

  created_at timestamptz not null default now(),

  constraint outreach_roles_slots_filled_le_total check (slots_filled <= slots_total)
);

-- SUPERSEDED by the coalesce index — see the status note at the top of this
-- document and the migration itself. A plain unique (outreach_id, category)
-- would forbid "1 experienced nurse + 4 nurses of any level".
create unique index outreach_roles_unique_category_level
  on outreach_roles (outreach_id, category, coalesce(min_experience_level, 'any'));

create index if not exists outreach_roles_outreach_id_idx on outreach_roles(outreach_id);
```

### 2.2 Applications point at a role

```sql
-- Which role this application is for. NULL in single-role mode, and NULL for
-- every application that already exists — which is why it is nullable rather
-- than defaulted. A default would silently attach historical applications to a
-- role nobody chose.
alter table applications
  add column if not exists outreach_role_id uuid references outreach_roles(id) on delete set null;

create index if not exists applications_outreach_role_id_idx on applications(outreach_role_id);
```

`on delete set null` rather than `cascade`: if an organisation deletes a role
from a draft, the applications to it must survive as a record — losing a
volunteer's application because the organisation reorganised its roster would
be indefensible.

### 2.3 Keeping slots_filled honest, per role and in total

The existing `trg_applications_sync_slots_filled` re-derives
`outreaches.slots_filled` from accepted applications. It needs a sibling, and
the outreach total becomes the sum of its roles.

```sql
-- ============================================================
-- Re-derives outreach_roles.slots_filled from accepted applications, then
-- rolls the total up to outreaches.slots_filled.
--
-- Derived, never incremented: two admins accepting concurrently cannot
-- double-count, which is the same reasoning as the existing outreach trigger.
-- ============================================================
create or replace function sync_role_slots_filled() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  affected_role uuid := coalesce(new.outreach_role_id, old.outreach_role_id);
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  if affected_role is not null then
    update outreach_roles r
       set slots_filled = (
         select count(*) from applications a
          where a.outreach_role_id = r.id and a.status = 'accepted'
       )
     where r.id = affected_role;
  end if;

  -- In multi-role mode the outreach total is the sum of its roles; in
  -- single-role mode the existing trigger's derivation still governs.
  if exists (select 1 from outreach_roles where outreach_id = affected_outreach) then
    update outreaches o
       set slots_filled = (
         select coalesce(sum(r.slots_filled), 0)
           from outreach_roles r where r.outreach_id = o.id
       ),
       slots_total = (
         select coalesce(sum(r.slots_total), 0)
           from outreach_roles r where r.outreach_id = o.id
       )
     where o.id = affected_outreach;
  end if;

  return null;
end $$;

create trigger trg_applications_sync_role_slots
  after insert or update of status, outreach_role_id or delete on applications
  for each row execute function sync_role_slots_filled();
```

**`outreaches.slots_total` becomes derived in multi-role mode.** That is the
single most consequential line in this plan: in multi-role mode the organisation
no longer types a total, it types per-role counts and the total is their sum.
The column stays (every existing query, the feed pre-filter and
`lib/roster.ts` all read it) but it is maintained by trigger rather than by the
client. A second trigger is needed on `outreach_roles` itself so that editing a
role's `slots_total` re-rolls the outreach total.

```sql
create or replace function sync_outreach_totals_from_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set slots_total  = (select coalesce(sum(r.slots_total), 0)  from outreach_roles r where r.outreach_id = o.id),
         slots_filled = (select coalesce(sum(r.slots_filled), 0) from outreach_roles r where r.outreach_id = o.id)
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end $$;

create trigger trg_outreach_roles_sync_totals
  after insert or update or delete on outreach_roles
  for each row execute function sync_outreach_totals_from_roles();
```

### 2.4 The outreach's own role_type becomes a summary

```sql
-- An outreach is 'clinical' if ANY of its roles is clinical. This column stays
-- for DISPLAY and for coarse filtering only. The authoritative, per-application
-- verification gate reads outreach_roles.role_type — see section 4.
create or replace function sync_outreach_role_type() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set role_type = case
           when exists (select 1 from outreach_roles r
                         where r.outreach_id = o.id and r.role_type = 'clinical')
           then 'clinical' else 'support' end
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end $$;

create trigger trg_outreach_roles_sync_role_type
  after insert or update of role_type or delete on outreach_roles
  for each row execute function sync_outreach_role_type();
```

### 2.5 RLS

`outreach_roles` inherits the visibility of its parent outreach exactly.

```sql
alter table outreach_roles enable row level security;

-- Readable wherever the parent outreach is readable. Mirrors
-- outreaches_select_open_or_own rather than restating its logic, so the two
-- cannot drift.
create policy outreach_roles_select on outreach_roles
  for select to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id
       and (o.status <> 'draft' or o.organisation_id = auth.uid())
  ));

-- Only the owning organisation writes them.
create policy outreach_roles_insert on outreach_roles
  for insert to authenticated
  with check (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id and o.organisation_id = auth.uid()
  ));

create policy outreach_roles_update on outreach_roles
  for update to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id and o.organisation_id = auth.uid()
  ));

create policy outreach_roles_delete on outreach_roles
  for delete to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id and o.organisation_id = auth.uid()
  ));
```

### 2.6 Column-level GRANTs

Per CLAUDE.md, `slots_filled` is server-derived and must NOT be client-writable.

```sql
revoke insert, update on outreach_roles from authenticated;

grant insert (outreach_id, category, role_type, required_skills, slots_total)
  on outreach_roles to authenticated;

-- id included because the app upserts roles on the PK when editing an outreach
-- (PostgREST compiles ON CONFLICT DO UPDATE with every payload column,
-- the PK included — see CLAUDE.md).
grant update (id, category, role_type, required_skills, slots_total)
  on outreach_roles to authenticated;

-- applications: outreach_role_id must be settable on INSERT (the volunteer
-- chooses the role) but NOT on UPDATE — otherwise an accepted volunteer could
-- move themselves into a different role's slot after the fact.
grant insert (outreach_id, volunteer_id, type, motivation, outreach_role_id)
  on applications to authenticated;
```

`slots_filled` appears in neither grant list. A write failure on it is
`permission denied for table outreach_roles` (42501) and must **never** be fixed
by adding it to a grant list — the derivation is the trigger's job.

---

## 3. Matching engine — the gated part

Currently `categoryMatchScore(volunteerCategory, outreach.required_category)`
returns exact 1.0 / related 0.5 / none 0, weighted at 20 of 100.

### Proposal: score against every role, take the best, and report which

```ts
// lib/matching/layer1.ts — new, additive. The existing single-role
// computeLayer1MatchScore is UNCHANGED and stays the path for single-role
// outreaches, so no existing score moves.
export interface Layer1RoleInput {
  id: string;
  category: string | null;
  role_type: OutreachRoleType | null;
  required_skills?: readonly string[] | null;
  slots_total: number;
  slots_filled: number;
}

export interface Layer1MultiRoleResult extends Layer1MatchResult {
  /** The role that produced this score, or null for a single-role outreach. */
  bestRoleId: string | null;
}

export function computeLayer1MultiRoleScore(
  volunteer: Layer1VolunteerInput,
  outreach: Layer1OutreachInput,
  roles: readonly Layer1RoleInput[]
): Layer1MultiRoleResult;
```

Rules:

1. **No roles → delegate to the existing function unchanged.** Single-role
   scoring is untouched, so nothing that works today changes value.
2. **With roles → score the volunteer once per role** (each role supplying its
   own `category`, `role_type` and `required_skills`, falling back to the
   outreach's `required_skills` when the role's is null) **and take the
   maximum.** Ties break toward the role with more places left, then by
   category name for determinism.
3. **Full roles are still scored, not skipped.** A volunteer whose only match is
   a full role should see a real score with "this role is full" rather than a
   misleadingly low one — the same principle as the feed pre-filter, which only
   excludes the genuinely impossible.
4. The weights, the normalisation, and the reliability multiplier are all
   **unchanged**. Category remains 20 of 100. The only thing that changes is
   *which* category the 20 points are computed against.

**Why maximum and not average.** A volunteer is one person who will fill one
slot. Averaging across roles would score a nurse on an event wanting nurses and
doctors at ~0.75 category, when their actual fit for the role they would take is
1.0. The match score answers "how well does this person fit a place on this
event", and the answer is the best place available to them.

**Reporting the role is not cosmetic.** `applications.outreach_role_id` records
which role the volunteer applied for, and the match breakdown sheet must say
"scored as: Nurse" — otherwise an organisation sees a 92% with no way to know
which of its four requirements it refers to.

### Where it is called

- `/api/match` `rank_feed` — one extra query for the roles of the candidate
  outreaches, batched with `.in('outreach_id', ids)`, so it stays one round trip.
- `/api/match` `score_applicants` and `score_my_application` — scored against
  the role applied for when `outreach_role_id` is set, and against the best
  available role when it is not.
- Layer 2 (Gemini) enriches the skills component of the **winning role only**,
  so quota use does not multiply by the number of roles.

---

## 4. The verification gate — the question you asked

> Is the outreach clinical if only one accepted role is?

**Proposal: the gate moves from the outreach to the ROLE APPLIED FOR.**

- Applying for a **clinical** role → `verification_status = 'verified'` required,
  Full Application only. Unchanged in substance.
- Applying for a **support** role on the *same outreach* → no verification
  required, Quick Join allowed.

This is strictly better than the current all-or-nothing rule, and it is the
whole reason multi-role is worth building: a vaccination drive that needs 3
nurses and 6 general helpers can currently only be posted as clinical (locking
out every unverified helper) or as support (waving through unverified people
into a clinical role). Neither is right.

`outreaches.role_type` still summarises to 'clinical' if any role is, which is
what the feed badge and the coarse filters read — so an unverified volunteer
sees the event, sees it marked clinical, and finds the support roles open to
them on the detail screen. Nothing becomes invisible.

The RLS insert policy on `applications` changes accordingly:

```sql
-- Replaces the clinical clause of applications_insert_own. The gate now reads
-- the ROLE's role_type when one was chosen, and falls back to the outreach's
-- when it was not (single-role mode).
create or replace function application_role_is_clinical(
  p_outreach_id uuid, p_role_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.role_type = 'clinical' from outreach_roles r where r.id = p_role_id),
    (select o.role_type = 'clinical' from outreaches o where o.id = p_outreach_id),
    false
  );
$$;
```

Plus a guard that the chosen role actually belongs to the named outreach —
without it a volunteer could pass a support role's id while applying to a
different outreach's clinical event:

```sql
alter table applications add constraint applications_role_belongs_to_outreach
  check (outreach_role_id is null or public.role_matches_outreach(outreach_id, outreach_role_id));
```

*(A check constraint cannot contain a subquery, so in practice this is a
BEFORE INSERT/UPDATE trigger raising an exception rather than a constraint —
noted here so the implementation does not discover it late.)*

---

## 5. Screens affected

| Screen | Change | Size |
|---|---|---|
| Create Outreach step 2 | Category + slots becomes a **role builder**: add a role, pick category, clinical/support, slot count, optional per-role skills. A "just any N volunteers" toggle keeps the current single-category form as the default. | Large |
| Create Outreach step 4 (preview) | Show the role breakdown | Small |
| Volunteer feed card | "2 doctors · 3 nurses · 5 students" instead of one category | Small |
| Outreach Detail | Role list with places left per role; the apply CTA becomes **per role**; the verification lock applies per role | Large |
| Full Application / Quick Join | Carry `outreach_role_id`; the gate reads the role | Medium |
| Match breakdown sheet | State which role produced the score | Small |
| Applicant Vetting | Group applicants by role; the roster card and `planBatchAccept` become **per role** — "Accept top 2" for doctors is a different question from "Accept top 5" for students | Large |
| Schedule / My Applications | Show the role the volunteer holds | Small |
| Attendance | Unchanged | — |

`lib/roster.ts` needs a per-role variant of `planBatchAccept` and
`skillCoverage`. The skill-coverage indicator arguably becomes *more* useful
here: coverage per role is a sharper question than coverage overall.

---

## 6. Migration and rollout

1. `supabase/migrations/2026XXXX_multi_role_outreaches.sql` — table, column,
   triggers, RLS, grants. **Purely additive: no existing outreach gains a role
   row, so every existing outreach stays in single-role mode and behaves
   identically.**
2. `lib/matching/layer1.ts` — new additive function, existing one untouched.
   Full unit coverage before anything calls it.
3. `/api/match` — role-aware scoring behind the same "no roles → old path" rule.
4. Screens, in the order above.

**Backwards compatibility is the acceptance test:** an outreach created before
this migration, and an outreach created after it using the single-category
form, must produce byte-identical match scores to today. That is testable and
should be a test.

---

## 7. What could break

- **`slots_total` becoming trigger-derived in multi-role mode** is the main
  risk. Any client code that writes it directly on a multi-role outreach will
  have its value overwritten. The Create Outreach wizard must stop sending it
  in multi-role mode.
- **`applications.outreach_role_id` is nullable forever.** Every read path must
  handle null (single-role mode and all historical rows). A `not null` would be
  wrong and would break history.
- **The `unique (outreach_id, category)` constraint** means an organisation
  cannot ask for "2 senior nurses and 3 junior nurses". That is a deliberate
  limit — seniority is `experience_level`, not category. Worth confirming it
  matches expectations.
- **Waitlist promotion** (`/api/application-status`) must promote within the
  *same role*, or a freed doctor slot would be filled by the best-ranked
  waitlisted student. This is a real change to working code and needs a test.
- **The feed pre-filter's `slots_filled < slots_total`** keeps working unchanged
  because the totals roll up — but an outreach with one full role and one empty
  role correctly stays in the feed.

---

## 8. Estimated shape

Roughly: 1 migration, ~250 lines of SQL, ~200 lines of new pure TypeScript with
~60 unit tests, ~150 lines of API change, and six screens of which three are
substantial. It is the largest single change since Phase 3.

**Nothing here is built. Awaiting approval.**
