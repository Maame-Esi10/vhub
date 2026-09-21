-- ============================================================================
-- TEST VOLUNTEERS  --  ten seeded accounts for oversubscription testing.
--
-- Run the WHOLE FILE in the Supabase SQL editor. Idempotent: running it twice
-- creates nothing extra. No begin/commit (the editor wraps a paste in one
-- transaction already) and no temp tables (they do not survive between
-- statements there).
--
-- WHY THIS EXISTS. Oversubscription, the waitlist cap, the skill-coverage
-- indicator and the ranked Accept-top-N button cannot be exercised with one
-- or two real accounts: they only behave differently once applicants outnumber
-- slots, and they RANK, so the applicants have to differ from each other in
-- ways the scorer can see. Ten hand-written accounts spanning every category,
-- three experience levels, four regions and the full V-Score range give the
-- matcher something to actually sort.
--
-- EVERY ROW IS IDENTIFIABLE AND REMOVABLE. Emails all end in
-- `@seed.vhub.test`, which is a reserved TLD that can never be a real address,
-- so 03_teardown.sql removes exactly these accounts and nothing else. Nothing
-- here touches a row it did not create.
--
-- THESE ACCOUNTS CAN SIGN IN. Password for all ten: SeedVolunteer1
-- That is deliberate -- being able to log in as one of them is how you check
-- what an applicant sees, not just what the organiser sees. They are test
-- accounts on a test database; do not run this against anything you would mind
-- somebody logging into.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auth users.
--
-- Written directly rather than through the admin API because that needs the
-- service-role key, which lives only in Vercel. The SQL editor is already
-- privileged, so this is the one place the rows can be made without exporting
-- a secret to a laptop.
--
-- `email_confirmed_at` is set, so none of them has to go through the OTP flow.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  v.id,
  'authenticated',
  'authenticated',
  v.email,
  extensions.crypt('SeedVolunteer1', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', v.full_name, 'role', 'volunteer'),
  now(),
  now()
from (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 'ama.mensah@seed.vhub.test',      'Ama Mensah'),
  ('11111111-0000-4000-8000-000000000002'::uuid, 'kwame.boateng@seed.vhub.test',   'Kwame Boateng'),
  ('11111111-0000-4000-8000-000000000003'::uuid, 'efua.asante@seed.vhub.test',     'Efua Asante'),
  ('11111111-0000-4000-8000-000000000004'::uuid, 'yaw.owusu@seed.vhub.test',       'Yaw Owusu'),
  ('11111111-0000-4000-8000-000000000005'::uuid, 'akosua.darko@seed.vhub.test',    'Akosua Darko'),
  ('11111111-0000-4000-8000-000000000006'::uuid, 'kofi.antwi@seed.vhub.test',      'Kofi Antwi'),
  ('11111111-0000-4000-8000-000000000007'::uuid, 'abena.nyarko@seed.vhub.test',    'Abena Nyarko'),
  ('11111111-0000-4000-8000-000000000008'::uuid, 'kojo.appiah@seed.vhub.test',     'Kojo Appiah'),
  ('11111111-0000-4000-8000-000000000009'::uuid, 'adwoa.frimpong@seed.vhub.test',  'Adwoa Frimpong'),
  ('11111111-0000-4000-8000-000000000010'::uuid, 'kwabena.osei@seed.vhub.test',    'Kwabena Osei')
) as v(id, email, full_name)
where not exists (select 1 from auth.users u where u.id = v.id);

-- The identity row is what makes email/password sign-in work. Without it the
-- user exists and cannot log in, which looks like a wrong password.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  u.id::text,
  now(), now(), now()
from auth.users u
where u.email like '%@seed.vhub.test'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- ---------------------------------------------------------------------------
-- 2. Profiles.
--
-- Four regions on purpose. The ranked feed pre-filters to the volunteer's own
-- region plus its neighbours, so a seed set confined to one region would never
-- exercise the widening rule or the location component's 1.0 / 0.5 / 0 split.
-- ---------------------------------------------------------------------------
insert into profiles (id, role, full_name, email, phone, region, district)
select p.id, 'volunteer'::profile_role, p.full_name, p.email, p.phone, p.region, p.district
from (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 'Ama Mensah',     'ama.mensah@seed.vhub.test',     '+233201000001', 'Greater Accra', 'Ayawaso East'),
  ('11111111-0000-4000-8000-000000000002'::uuid, 'Kwame Boateng',  'kwame.boateng@seed.vhub.test',  '+233201000002', 'Greater Accra', 'Ayawaso East'),
  ('11111111-0000-4000-8000-000000000003'::uuid, 'Efua Asante',    'efua.asante@seed.vhub.test',    '+233201000003', 'Greater Accra', 'Ablekuma North'),
  ('11111111-0000-4000-8000-000000000004'::uuid, 'Yaw Owusu',      'yaw.owusu@seed.vhub.test',      '+233201000004', 'Greater Accra', 'Ga West'),
  ('11111111-0000-4000-8000-000000000005'::uuid, 'Akosua Darko',   'akosua.darko@seed.vhub.test',   '+233201000005', 'Greater Accra', 'Tema Metropolitan'),
  ('11111111-0000-4000-8000-000000000006'::uuid, 'Kofi Antwi',     'kofi.antwi@seed.vhub.test',     '+233201000006', 'Eastern',       'New Juaben South'),
  ('11111111-0000-4000-8000-000000000007'::uuid, 'Abena Nyarko',   'abena.nyarko@seed.vhub.test',   '+233201000007', 'Eastern',       'Akuapim North'),
  ('11111111-0000-4000-8000-000000000008'::uuid, 'Kojo Appiah',    'kojo.appiah@seed.vhub.test',    '+233201000008', 'Central',       'Cape Coast Metropolitan'),
  ('11111111-0000-4000-8000-000000000009'::uuid, 'Adwoa Frimpong', 'adwoa.frimpong@seed.vhub.test', '+233201000009', 'Ashanti',       'Kumasi Metropolitan'),
  ('11111111-0000-4000-8000-000000000010'::uuid, 'Kwabena Osei',   'kwabena.osei@seed.vhub.test',   '+233201000010', 'Ashanti',       'Kumasi Metropolitan')
) as p(id, full_name, email, phone, region, district)
where not exists (select 1 from profiles x where x.id = p.id);

-- ---------------------------------------------------------------------------
-- 3. Volunteer profiles.
--
-- DESIGNED TO PRODUCE A SPREAD, not to be realistic individually. Between them
-- these ten cover every category the enum holds, all three experience levels,
-- and V-Scores landing in all five bands, so the ranking is visibly ordered
-- rather than a row of near-identical percentages.
--
-- `verification_status` is written here rather than left at 'unverified'
-- because the clinical gate is one of the things worth testing: six of these
-- are verified and can apply to clinical roles, four cannot.
--
-- NOTE: v_score is a CACHE of a replayed history, and these ten have no
-- history. The numbers below are therefore fixtures for exercising the bands
-- and the ranking multiplier; the first real review on any of them will
-- replay from 70 and overwrite the value. That is correct behaviour, not a
-- bug, and it is why this file is a test fixture and not a migration.
-- ---------------------------------------------------------------------------
insert into volunteer_profiles (
  id, category, skill_tags, specialties, experience_level,
  availability_slots, bio, v_score, events_attended,
  declaration_signed, verification_status
)
select
  s.id, s.category::volunteer_category, s.skill_tags, s.specialties,
  s.experience_level::experience_level, s.availability_slots, s.bio,
  s.v_score, s.events_attended, s.declaration_signed,
  s.verification_status::verification_status
from (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 'nurse',
   array['Vital signs monitoring','Blood pressure measurement','Venipuncture','Wound dressing','Triage'],
   array['Community Health'], 'experienced',
   array['sat_morning','sat_afternoon','sun_morning'],
   'Registered nurse, six years on community outreach teams.', 94, 12, true, 'verified'),

  ('11111111-0000-4000-8000-000000000002'::uuid, 'doctor',
   array['Physical examination','Patient history taking','Triage','Referral and follow-up coordination'],
   array['General Medicine'], 'experienced',
   array['sat_morning','sat_afternoon'],
   'General practitioner volunteering at weekend screening camps.', 88, 9, true, 'verified'),

  ('11111111-0000-4000-8000-000000000003'::uuid, 'midwife',
   array['Antenatal care','Postnatal care','Breastfeeding support','Child growth monitoring','Family planning counselling'],
   array['Maternal Health'], 'experienced',
   array['sat_morning','sun_morning','sun_afternoon'],
   'Midwife focused on antenatal outreach in peri-urban Accra.', 81, 7, true, 'verified'),

  ('11111111-0000-4000-8000-000000000004'::uuid, 'pharmacist',
   array['Medication dispensing','Prescription review','Patient counselling on medication','Dosage calculation','Inventory management'],
   array['Pharmacy'], 'intermediate',
   array['sat_afternoon','sat_evening'],
   'Community pharmacist, runs the dispensing table at health fairs.', 76, 5, true, 'verified'),

  ('11111111-0000-4000-8000-000000000005'::uuid, 'student',
   array['Patient registration','Vital signs monitoring','Health education','Data entry'],
   array[]::text[], 'beginner',
   array['sat_morning','sat_afternoon','sun_morning','sun_afternoon'],
   'Final-year nursing student, free most weekends.', 70, 0, false, 'unverified'),

  ('11111111-0000-4000-8000-000000000006'::uuid, 'student',
   array['Patient registration','Crowd and queue management','Health education','Community mobilisation'],
   array[]::text[], 'beginner',
   array['sat_morning'],
   'Medical student. Saturday mornings only.', 70, 0, false, 'unverified'),

  ('11111111-0000-4000-8000-000000000007'::uuid, 'first_aider',
   array['Basic Life Support (BLS)','Cardiopulmonary resuscitation (CPR)','Wound and bleeding control','Splinting and immobilisation'],
   array[]::text[], 'intermediate',
   array['sat_morning','sat_afternoon'],
   'Red Cross trained first aider.', 64, 3, false, 'documents_pending'),

  ('11111111-0000-4000-8000-000000000008'::uuid, 'nurse',
   array['Visual acuity screening','Eye health education','Vital signs monitoring','Patient registration'],
   array['Eye Care'], 'intermediate',
   array['sun_morning','sun_afternoon'],
   'Ophthalmic nurse, works eye camps in the Central Region.', 58, 4, true, 'verified'),

  ('11111111-0000-4000-8000-000000000009'::uuid, 'other',
   array['Logistics and setup','Crowd and queue management','Translation/interpretation','Record keeping'],
   array[]::text[], 'beginner',
   array['sat_morning','sat_afternoon','sun_morning'],
   'Not clinically trained. Helps with setup, crowd flow and Twi interpreting.', 45, 2, false, 'unverified'),

  ('11111111-0000-4000-8000-000000000010'::uuid, 'nurse',
   array['Vital signs monitoring','Injection administration','Vaccination administration'],
   array['Community Health'], 'intermediate',
   array['sat_afternoon'],
   'Nurse. Has missed two confirmed outreaches.', 32, 6, true, 'verified')
) as s(id, category, skill_tags, specialties, experience_level,
       availability_slots, bio, v_score, events_attended,
       declaration_signed, verification_status)
where not exists (select 1 from volunteer_profiles v where v.id = s.id);

-- ---------------------------------------------------------------------------
-- 4. Verification. READ THE RESULT.
--
-- Asserted rather than trusted: a silent partial insert here would show up
-- later as a matching test that ranks four people when it should rank ten,
-- which is a confusing thing to debug from the app.
-- ---------------------------------------------------------------------------
do $$
declare
  users_count int;
  identities_count int;
  profiles_count int;
  volunteers_count int;
  band_spread int;
begin
  select count(*) into users_count      from auth.users where email like '%@seed.vhub.test';
  select count(*) into identities_count from auth.identities i
    join auth.users u on u.id = i.user_id where u.email like '%@seed.vhub.test';
  select count(*) into profiles_count   from profiles where email like '%@seed.vhub.test';
  select count(*) into volunteers_count from volunteer_profiles v
    join profiles p on p.id = v.id where p.email like '%@seed.vhub.test';

  -- All five V-Score bands represented, which is the whole point of the spread.
  select count(distinct case
      when v.v_score >= 90 then 'Elite'
      when v.v_score >= 75 then 'Trusted'
      when v.v_score >= 60 then 'Active'
      when v.v_score >= 40 then 'Developing'
      else 'At Risk' end)
    into band_spread
  from volunteer_profiles v join profiles p on p.id = v.id
  where p.email like '%@seed.vhub.test';

  if users_count <> 10 then
    raise exception 'FAILED: expected 10 seeded auth users, found %', users_count;
  end if;
  if identities_count <> 10 then
    raise exception 'FAILED: expected 10 identities (none of them could sign in), found %', identities_count;
  end if;
  if profiles_count <> 10 then
    raise exception 'FAILED: expected 10 seeded profiles, found %', profiles_count;
  end if;
  if volunteers_count <> 10 then
    raise exception 'FAILED: expected 10 seeded volunteer profiles, found %', volunteers_count;
  end if;
  if band_spread <> 5 then
    raise exception 'FAILED: expected all 5 V-Score bands represented, found %', band_spread;
  end if;

  raise notice 'OK: 10 test volunteers seeded, all five V-Score bands present. Password: SeedVolunteer1';
end $$;

-- What you just created.
select p.full_name, p.email, p.region, v.category, v.experience_level,
       v.v_score, v.verification_status
from profiles p
join volunteer_profiles v on v.id = p.id
where p.email like '%@seed.vhub.test'
order by v.v_score desc;
