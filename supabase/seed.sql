-- Seed data for the local Supabase stack (`npm run db:start`).
--
-- Runs automatically after supabase/migrations/ on `supabase start` and
-- `supabase db reset`. Never applied to the hosted project.
--
-- Gives a fresh clone something to log into and look at:
--   * the test account documented in AGENTS.md — test@test.com / testtest
--   * one Sleeper and one Ottoneu integration for that user
--   * a league row per integration
--
-- No real provider credentials, so the scoreboard will not populate from
-- these rows alone. For a populated scoreboard use demo mode, which needs
-- no database at all: `DEMO_MODE=1 npm run dev`. These rows exist so the
-- /integrations screens have something to render and so queries against
-- fp_* tables return more than an empty set.

-- ---------------------------------------------------------------------------
-- Test user
-- ---------------------------------------------------------------------------
-- Written straight into auth.users because GoTrue's admin API isn't running
-- yet at seed time. The password hash below is bcrypt of 'testtest'.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'test@test.com',
  crypt('testtest', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  false
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"test@test.com","email_verified":true}',
  'email',
  now(),
  now(),
  now()
)
on conflict (id, provider) do nothing;

-- ---------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------
-- Sleeper is username-based and Ottoneu is scraped from public pages, so
-- neither needs a secret here. Yahoo and ESPN are omitted deliberately:
-- Yahoo needs a real OAuth token and ESPN needs cookies copied from a
-- logged-in browser session, and a fake value for either would fail in a
-- way that looks like a bug rather than like missing setup.
insert into public.fp_user_integrations (user_id, provider, provider_user_id)
values
  ('11111111-1111-1111-1111-111111111111', 'sleeper', '123456789012345678'),
  ('11111111-1111-1111-1111-111111111111', 'ottoneu', '54321')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Leagues
-- ---------------------------------------------------------------------------
insert into public.fp_leagues (
  league_id,
  name,
  user_integration_id,
  season,
  total_rosters,
  status,
  user_id
)
select
  'seed-sleeper-league',
  'Seed Sleeper League',
  i.id,
  extract(year from now())::text,
  12,
  'in_season',
  i.user_id
from public.fp_user_integrations i
where i.user_id = '11111111-1111-1111-1111-111111111111'
  and i.provider = 'sleeper'
on conflict do nothing;

insert into public.fp_leagues (
  league_id,
  name,
  user_integration_id,
  season,
  total_rosters,
  status,
  user_id
)
select
  'seed-ottoneu-league',
  'Seed Ottoneu League',
  i.id,
  extract(year from now())::text,
  12,
  'in_season',
  i.user_id
from public.fp_user_integrations i
where i.user_id = '11111111-1111-1111-1111-111111111111'
  and i.provider = 'ottoneu'
on conflict do nothing;
