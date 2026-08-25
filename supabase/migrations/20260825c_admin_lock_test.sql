-- ============================================================
-- Admin phase, package A — THE TEST. Not a migration; it changes nothing.
--
-- Run this AFTER pastes a and b. It answers the one question the plan says
-- must be tested rather than assumed: now that 'admin' is a legal value of
-- profile_role, can a signed-in client give itself that role?
--
-- HOW TO READ THE RESULT — this is the whole point of the shape below:
--
--   "Success. No rows returned."  => every lock held. Nothing to do.
--   An ERROR message              => a lock did NOT hold, and the message
--                                    names which one and what actually
--                                    happened. Stop and report it.
--
-- The block impersonates a real signed-in user (it borrows the first profile
-- in the table and its uid) and then tries the two escalation moves a crafted
-- client could make against the REST API. Everything runs inside the editor's
-- transaction and every attempt is rolled back, so no data is touched and no
-- role is changed. `set local` unwinds when the transaction ends.
-- ============================================================

do $$
declare
  v_uid   uuid;
  v_state text;
  v_msg   text;
  v_leaked boolean;
begin
  select id into v_uid from profiles order by created_at limit 1;
  if v_uid is null then
    raise exception 'Cannot run: there are no profiles rows to impersonate. Register one account first.';
  end if;

  -- Become that user, exactly as PostgREST does for a request carrying their
  -- JWT: the `authenticated` role (so column grants apply) plus the claims
  -- auth.uid() reads (so RLS applies).
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- --------------------------------------------------------
  -- Lock 1 — UPDATE. `role` is absent from the client's UPDATE grant list,
  -- so this must fail with 42501 "permission denied for table profiles"
  -- BEFORE RLS is even consulted. This is the lock that predates 'admin'.
  -- --------------------------------------------------------
  begin
    update profiles set role = 'admin' where id = v_uid;
    v_leaked := true;
  exception when others then
    v_leaked := false;
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;

  if v_leaked then
    execute 'reset role';
    raise exception 'LOCK 1 FAILED: a client updated its own profiles.role to admin. profiles.role is in the UPDATE grant list and must not be.';
  end if;

  if v_state <> '42501' then
    execute 'reset role';
    raise exception 'LOCK 1 blocked, but with SQLSTATE % (%) instead of 42501. Expected a column-privilege refusal; read the message before trusting it.', v_state, v_msg;
  end if;

  -- --------------------------------------------------------
  -- Lock 2 — INSERT. This is the one paste 1 put at risk. The profiles row
  -- is created BY THE CLIENT at signup, so the role in that insert is the
  -- client's to choose; paste 2 added `role <> 'admin'` to the with-check.
  -- Must fail with 42501, "new row violates row-level security policy".
  --
  -- Postgres evaluates the RLS with-check before the row reaches the primary
  -- key index, so re-inserting an id that already exists still exercises the
  -- policy rather than tripping over the duplicate. Lock 3 below proves that
  -- ordering rather than assuming it.
  -- --------------------------------------------------------
  begin
    insert into profiles (id, role, full_name) values (v_uid, 'admin', 'escalation test');
    v_leaked := true;
  exception when others then
    v_leaked := false;
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;

  if v_leaked then
    execute 'reset role';
    raise exception 'LOCK 2 FAILED: a client inserted a profiles row with role=admin. The profiles_insert_own with-check is not barring admin — re-run paste 2 section 2.';
  end if;

  if v_state = '23505' then
    execute 'reset role';
    raise exception 'LOCK 2 INCONCLUSIVE: the insert hit the primary key (23505) before the policy, so this test did not reach the admin clause. Retest with an auth user that has no profiles row.';
  end if;

  if v_state <> '42501' then
    execute 'reset role';
    raise exception 'LOCK 2 blocked, but with SQLSTATE % (%) instead of 42501. Read the message before trusting it.', v_state, v_msg;
  end if;

  -- --------------------------------------------------------
  -- Lock 3 — the control. The SAME insert with a legitimate role must fail
  -- on the duplicate key (23505), not on the policy. That is what proves
  -- lock 2's refusal came from the admin clause and not from something that
  -- would have refused any insert at all.
  -- --------------------------------------------------------
  begin
    insert into profiles (id, role, full_name) values (v_uid, 'volunteer', 'control test');
    v_leaked := true;
  exception when others then
    v_leaked := false;
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;

  if v_leaked or v_state <> '23505' then
    execute 'reset role';
    raise exception 'CONTROL INCONCLUSIVE: inserting a duplicate row with role=volunteer gave % (%), expected 23505 duplicate key. Lock 2 above may have been refused for an unrelated reason.', coalesce(v_state, 'no error'), coalesce(v_msg, 'insert succeeded');
  end if;

  -- --------------------------------------------------------
  -- Lock 4 — the audit trail is not client-writable. A client that could
  -- write admin_actions could fabricate the evidence for a decision, or bury
  -- a real one under noise.
  -- --------------------------------------------------------
  begin
    insert into admin_actions (target_type, action) values ('organisation', 'forged');
    v_leaked := true;
  exception when others then
    v_leaked := false;
  end;

  execute 'reset role';

  if v_leaked then
    raise exception 'LOCK 4 FAILED: a client inserted an admin_actions row. Re-run paste 2 section 3 — the revoke did not take.';
  end if;
end $$;
