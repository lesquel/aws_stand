-- ============================================================================
-- Cloud Quest · SP1 foundation (greenfield)
-- Multi-event platform: profiles, events, stands, activities, badges, prizes,
-- participations, staff assignments, admin allowlist.
--
-- Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
-- This SUPERSEDES the legacy supabase/schema.sql (become_staff / change_stand /
-- hardcoded staff code are removed; identity is email + per-user qr_token).
--
-- Apply via Supabase migration tooling. The `public` schema is assumed empty.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- admin_allowlist — created first because the signup trigger reads it.
-- Service-role only: RLS on, zero client policies, no grants to anon/authenticated.
-- ----------------------------------------------------------------------------
create table public.admin_allowlist (
  email text primary key
);
alter table public.admin_allowlist enable row level security;
revoke all on public.admin_allowlist from anon, authenticated;

-- ----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users. email is the unique identity; username is a
-- non-unique display field; qr_token is unique per user (RN-01).
-- ----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null check (char_length(username) between 2 and 14),
  email      text not null unique,
  base_id    text not null default 'explorer',
  role       text not null default 'player' check (role in ('player', 'staff', 'admin')),
  qr_token   text not null unique,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ----------------------------------------------------------------------------
-- is_admin() — SECURITY DEFINER helper so admin-write policies can check the
-- caller's role without recursing through profiles' own RLS.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- handle_new_user — on auth.users insert, create the profile.
-- role is 'admin' when the email is allowlisted, else 'player'.
-- username/base_id come from signup metadata; fall back to safe defaults so
-- service-role / admin-API user creation (no metadata) still succeeds.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, email, base_id, qr_token, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'Player'),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'base_id', ''), 'explorer'),
    replace(gen_random_uuid()::text, '-', ''),
    case
      when exists (select 1 from public.admin_allowlist a where a.email = new.email)
        then 'admin'
      else 'player'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- profiles RLS: owner can read/update own row. Insert is handled by the
-- SECURITY DEFINER trigger (it bypasses RLS), so no client insert policy.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-grant discipline: clients may only change username/base_id.
-- role / email / qr_token stay write-locked.
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, base_id) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- events — multi-event container.
-- ----------------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  status      text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);
alter table public.events enable row level security;

-- ----------------------------------------------------------------------------
-- stands — belong to an event.
-- ----------------------------------------------------------------------------
create table public.stands (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  tag         text,
  map_x       numeric not null,
  map_y       numeric not null,
  icon        text,
  color       text,
  accent      text,
  piece_id    text,
  sort        int not null default 0,
  unique (event_id, slug)
);
alter table public.stands enable row level security;

-- ----------------------------------------------------------------------------
-- activities — one per stand (RN-03): unique(stand_id). Also unique(stand_id, slug).
-- ----------------------------------------------------------------------------
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  stand_id      uuid not null references public.stands(id) on delete cascade,
  slug          text not null,
  name          text not null,
  description   text,
  score_type    text not null default 'fixed' check (score_type in ('fixed', 'position')),
  points_fixed  int not null default 1,
  points_first  int,
  points_second int,
  points_third  int,
  special       boolean not null default false,
  sort          int not null default 0,
  unique (stand_id),
  unique (stand_id, slug)
);
alter table public.activities enable row level security;

-- ----------------------------------------------------------------------------
-- badges — one per activity (RN-04): unique(activity_id).
-- ----------------------------------------------------------------------------
create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities(id) on delete cascade,
  name        text not null,
  description text,
  icon        text
);
alter table public.badges enable row level security;

-- ----------------------------------------------------------------------------
-- prizes — belong to an event.
-- ----------------------------------------------------------------------------
create table public.prizes (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  slug     text not null,
  name     text not null,
  cost     int not null,
  stock    int not null,
  raffle   boolean not null default false,
  unique (event_id, slug)
);
alter table public.prizes enable row level security;

-- ----------------------------------------------------------------------------
-- participations — per-event player progress ledger.
-- ----------------------------------------------------------------------------
create table public.participations (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.profiles(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  tickets         int not null default 0,
  pieces          jsonb not null default '[]'::jsonb,
  badges          jsonb not null default '[]'::jsonb,
  claimed         jsonb not null default '[]'::jsonb,
  done_activities jsonb not null default '[]'::jsonb,
  joined_at       timestamptz default now(),
  unique (player_id, event_id)
);
alter table public.participations enable row level security;

-- ----------------------------------------------------------------------------
-- staff_assignments — who staffs which stand at which event (consumed by SP3).
-- ----------------------------------------------------------------------------
create table public.staff_assignments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.profiles(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  stand_id   uuid not null references public.stands(id) on delete cascade,
  created_at timestamptz default now(),
  unique (staff_id, event_id, stand_id)
);
alter table public.staff_assignments enable row level security;

-- ============================================================================
-- RLS policies — catalog tables: authenticated read of ACTIVE events (and
-- their children); admin-only writes.
-- ============================================================================

-- events
create policy events_select_active on public.events
  for select to authenticated
  using (status = 'active');

create policy events_admin_write on public.events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- stands
create policy stands_select_active on public.stands
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = stands.event_id and e.status = 'active'
  ));

create policy stands_admin_write on public.stands
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- activities
create policy activities_select_active on public.activities
  for select to authenticated
  using (exists (
    select 1
    from public.stands s
    join public.events e on e.id = s.event_id
    where s.id = activities.stand_id and e.status = 'active'
  ));

create policy activities_admin_write on public.activities
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- badges
create policy badges_select_active on public.badges
  for select to authenticated
  using (exists (
    select 1
    from public.activities a
    join public.stands s on s.id = a.stand_id
    join public.events e on e.id = s.event_id
    where a.id = badges.activity_id and e.status = 'active'
  ));

create policy badges_admin_write on public.badges
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- prizes
create policy prizes_select_active on public.prizes
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = prizes.event_id and e.status = 'active'
  ));

create policy prizes_admin_write on public.prizes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.stands to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.badges to authenticated;
grant select, insert, update, delete on public.prizes to authenticated;

-- ============================================================================
-- RLS policies — participations: owner read/insert/update; gameplay columns only.
-- ============================================================================
create policy participations_select_own on public.participations
  for select to authenticated
  using (player_id = auth.uid());

create policy participations_insert_own on public.participations
  for insert to authenticated
  with check (player_id = auth.uid());

create policy participations_update_own on public.participations
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

grant select, insert on public.participations to authenticated;
revoke update on public.participations from authenticated;
grant update (tickets, pieces, badges, claimed, done_activities)
  on public.participations to authenticated;

-- ============================================================================
-- RLS policies — staff_assignments: assigned staff or admin can read; admin writes.
-- ============================================================================
create policy staff_assignments_select on public.staff_assignments
  for select to authenticated
  using (staff_id = auth.uid() or public.is_admin());

create policy staff_assignments_admin_write on public.staff_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.staff_assignments to authenticated;
