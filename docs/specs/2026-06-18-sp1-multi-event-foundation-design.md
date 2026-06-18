# SP1 — Multi-event foundation — design

- **Date:** 2026-06-18
- **Status:** Draft (pending spec review + user approval)
- **Project:** Cloud Quest (aws_stand)
- **Roadmap position:** Sub-project 1 of 3.
  - **SP1 — Multi-event foundation (this doc):** catalog → DB, per-event progress, `admin` role, player joins an event.
  - SP2 — Admin authoring: CRUD + visual map editor + staff assignment.
  - SP3 — Staff scan & completions: revised, event-scoped (supersedes `2026-06-18-staff-scan-completions-design.md`).

## Context & problem

Cloud Quest is becoming a **multi-event platform**: the app hosts many events (e.g. "AWS Day Quito",
"AWS Day Lima"), each with its own stands, activities, prizes, staff and leaderboard. Two structural
facts block this today:

1. **The catalog is hardcoded** in `src/domain/catalog.ts` (`STANDS`, `PIECES`, `PRIZES`, badge
   rules) and shipped to the client. Admins cannot create content at runtime, and the data is global.
2. **Player progress is a single global blob** (`profiles.progress` jsonb): one set of tickets,
   pieces, badges, claimed prizes per account. In a multi-event world this is wrong — progress at
   Quito must be separate from progress at Lima.

SP1 builds the foundation both later sub-projects sit on: a DB-backed catalog and per-event progress.

## Goals

- Model the platform in the DB: `events → stands → activities`, plus `prizes` per event.
- Move player progress out of `profiles` into **per-event `participations`**.
- Introduce the **`admin`** capability (no public path to gain it).
- App **reads the catalog from the DB** instead of importing `catalog.ts`.
- A player **joins/selects an event** before playing; all game state is scoped to that participation.
- **Seed** the current 5-stand catalog as one default event so the app keeps working end-to-end.

## Non-goals (deferred)

- Admin authoring UI and the visual map editor → **SP2**.
- Staff scanning, `completions`, points-on-scan → **SP3** (table shapes are anticipated here but the
  flow/RPC are out of scope for SP1).
- Multi-language authoring UX, event themes/branding, paid/ticketed events.

## Data model

```sql
-- role gains 'admin'
alter table public.profiles
  drop constraint profiles_role_check,
  add constraint profiles_role_check check (role in ('player', 'staff', 'admin'));

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  status      text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.stands (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  slug        text not null,                 -- stable id used in URLs / progress keys
  name        text not null,
  description text,
  tag         text,
  map_x       numeric not null,              -- map position (percent)
  map_y       numeric not null,
  icon        text,
  color       text,
  accent      text,
  piece_id    text,                          -- collectible awarded by this stand (nullable)
  sort        int not null default 0,
  unique (event_id, slug)
);

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  stand_id    uuid not null references public.stands(id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  points      int not null default 1,        -- authoritative points (was `tickets` in catalog)
  special     boolean not null default false,
  sort        int not null default 0,
  unique (stand_id, slug)
);

create table public.prizes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  slug        text not null,
  name        text not null,
  cost        int not null,
  stock       int not null,
  raffle      boolean not null default false,
  unique (event_id, slug)
);

-- per-event player progress (replaces profiles.progress for gameplay)
create table public.participations (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  tickets     int not null default 0,
  pieces      jsonb not null default '[]'::jsonb,
  badges      jsonb not null default '[]'::jsonb,
  claimed     jsonb not null default '[]'::jsonb,
  joined_at   timestamptz not null default now(),
  unique (player_id, event_id)
);

-- who staffs what (per event + stand). Anticipated here; consumed by SP3.
create table public.staff_assignments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.profiles(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  stand_id   uuid not null references public.stands(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_id, event_id, stand_id)
);
```

### Notes on the model

- **`slug` vs `uuid`:** uuids are primary keys; human/stable `slug`s (`cloud`, `c1`) keep URLs and the
  existing piece ids (`cap`, `visor`, …) readable and stable across seeds.
- **`participations` carries `doneActivities`?** In SP1, completed activities live in
  `participations` as a derived list too — but the authoritative per-activity ledger (`completions`,
  with timestamp + approver) lands in **SP3**. SP1 keeps a simple `doneActivities jsonb` on
  `participations` so the current self-complete flow keeps working until SP3 inverts it.
- **Staff identity:** the per-event/stand binding moves to `staff_assignments`. Whether
  `profiles.role` keeps a global `'staff'` value or staff-ness becomes *derived from having an
  assignment* is finalized in SP3; SP1 only creates the table.

## Catalog read path

- `src/domain/catalog.ts` stops being the runtime source. It is reduced to **types + the seed
  payload** used to populate the default event.
- A new repository (`src/infrastructure/supabase-catalog-repository.ts`) loads the active event's
  stands/activities/prizes from the DB. The domain keeps the same `Stand`/`Activity`/`Prize` shapes
  so presentation code changes minimally.
- Badge rules (`check(progress)` predicates) **stay in code** — they are logic, not content — but key
  off the per-event participation rather than the global progress.

## Player flow — joining an event

1. After login the player lands on an **event picker** listing `status = 'active'` events.
2. Selecting an event **joins** it: upsert a `participations` row (open join to active events).
3. The map and all game screens become scoped to the selected event + participation.
4. If exactly one active event exists, auto-select it (skip the picker) for a single-event feel.

> Join codes / private events are a future option; SP1 ships open join to active events.

## Admin role & bootstrapping

- `admin` is a **global account capability** (platform operator), set on `profiles.role`.
- **No public path** to become admin (unlike `become_staff`). The first admin is set out-of-band:
  `update public.profiles set role = 'admin' where id = '<uuid>';` run via the Supabase SQL editor
  (service role). This is documented in README/CLAUDE.md.
- SP1 only *recognises* the admin role (gates routes/queries); the admin **UI** is SP2.

## RLS / permissions

- `events`, `stands`, `activities`, `prizes`: **read** allowed to all authenticated users for
  `status = 'active'` events (and their children); **write** only to `admin` (enforced via policies
  checking the caller's `profiles.role = 'admin'`). Admin writes may also go through SECURITY DEFINER
  RPCs in SP2 — SP1 just sets read policies + admin-write policies.
- `participations`: a player may select/insert/update **their own** rows
  (`player_id = auth.uid()`), limited to gameplay columns (tickets/pieces/badges/claimed) — same
  column-grant discipline already used on `profiles`.
- `staff_assignments`: read by the assigned staff and by admins; write by admin only.

## Existing-data migration

- The live Supabase project is **not yet provisioned with real event data** (per prior session: RPCs
  and grants unverified against a live DB, project not yet created). SP1 therefore treats this as
  **greenfield** — no production progress to migrate.
- A `seed.sql` creates one `active` event ("AWS Cloud Quest") and ports the current `catalog.ts`
  content (5 stands, their activities/points, prizes). Existing `profiles.progress` is left in place
  but no longer read for gameplay; a one-line note documents that it is legacy.

## Testing (TDD)

- **Schema/RLS (integration):** admin can insert a stand; a player cannot; a player reads only active
  events; a player can read/write only their own participation; participation columns `role`/foreign
  ids are not client-writable.
- **Catalog repository (unit/integration):** loads stands/activities/prizes for an event in the right
  shape and order (`sort`); inactive events are not returned to players.
- **Join flow (integration):** joining an active event creates exactly one participation; re-join is
  idempotent; auto-select fires only when a single active event exists.
- **Seed parity (unit):** the seeded default event reproduces the current catalog (same stands,
  activities, points, prizes) so behaviour is unchanged for the default event.

## Risks

- **Wide blast radius:** every screen that imports `STANDS`/`PRIZES` changes to read from the
  repository. Mitigation: keep the domain `Stand`/`Activity`/`Prize` shapes identical so only the
  data *source* changes, not consumers' types.
- **Async catalog:** the catalog becomes async (DB fetch) where it was a synchronous import. The
  provider must handle a loading state for the catalog, not just for auth.

## Open questions (resolved in later sub-projects)

- Final staff-identity model (global role vs derived from `staff_assignments`) → SP3.
- Whether a player can be staff at one event and a player at another (per-event role) → SP3.
- Event join codes / private events → future.
