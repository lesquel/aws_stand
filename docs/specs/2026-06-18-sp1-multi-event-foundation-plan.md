# SP1 — Multi-event foundation — implementation plan

- **Date:** 2026-06-18
- **Spec:** [`2026-06-18-sp1-multi-event-foundation-design.md`](./2026-06-18-sp1-multi-event-foundation-design.md)
- **Mode:** Strict TDD (write the failing test first, then the implementation).
- **Delivery:** chained PRs, one per slice. Each slice is independently reviewable and leaves the app
  in a working state.

## Prerequisite (blocker — must be resolved before Slice 1)

SP1 is DB-centric and its tests are integration tests against Postgres + RLS. We need a Supabase
environment to run them:

- **Recommended:** local Supabase stack via the CLI (`supabase start`) so migrations and RLS can be
  tested without touching a remote project. Migrations live in `supabase/migrations/`.
- **Alternative:** a provisioned remote Supabase project (not yet created per project history).

Until one exists, Slice 1 can be authored but not verified. **Do not mark any DB slice done without a
green integration run.**

## Slice ordering (dependency graph)

```
S1 schema+RLS ──> S2 seed ──> S3 catalog read ──┐
                          └──> S4 participations ┴──> S5 event picker/join ──> S6 admin role+docs
```

---

### Slice 1 — Schema + RLS migration

- **Files:** `supabase/migrations/<ts>_multi_event_foundation.sql`.
- **Build:** `events`, `stands`, `activities`, `prizes`, `participations`, `staff_assignments`; add
  `'admin'` to the `profiles.role` check; RLS policies; column grants on `participations`
  (gameplay columns only, mirroring the existing `profiles` discipline).
- **Tests (first):** admin can insert a stand; non-admin cannot; players read only `active` events
  and their children; a player reads/writes only their own `participations` row; foreign-key/role
  columns are not client-writable.
- **Done:** migration applies cleanly; all RLS tests green.

### Slice 2 — Seed default event

- **Files:** `supabase/seed.sql`; trim `src/domain/catalog.ts` to a seed payload + types.
- **Build:** create one `active` event "AWS Cloud Quest"; port the current 5 stands, their
  activities/points, and prizes.
- **Tests (first):** seed parity — the seeded event reproduces the current catalog exactly (stand
  slugs, activity points, prizes, piece mapping).
- **Done:** seed runs; parity test green.

### Slice 3 — Catalog read repository

- **Files:** `src/infrastructure/supabase-catalog-repository.ts`; update consumers of `STANDS`/`PRIZES`.
- **Build:** load an event's stands/activities/prizes from the DB and map to the existing
  `Stand`/`Activity`/`Prize` domain shapes (shapes unchanged → consumers barely change).
- **Tests (first):** returns correct shapes and `sort` order; excludes inactive events; piece/badge
  references resolve.
- **Done:** repository tests green; app renders the seeded event's map from the DB.

### Slice 4 — Per-event progress (participations)

- **Files:** `src/infrastructure/supabase-game-repository.ts` (or new participation repository);
  progress read/write paths in `game-provider.tsx`.
- **Build:** move tickets/pieces/badges/claimed/doneActivities from `profiles.progress` to the
  player's `participations` row for the selected event.
- **Tests (first):** progress read/write scoped to a participation; column-grant discipline; legacy
  `profiles.progress` no longer read for gameplay.
- **Done:** progress tests green; playing the seeded event persists per-event.

### Slice 5 — Event picker + join flow

- **Files:** new event-picker screen/route; `game-provider.tsx` (async catalog + selected event +
  loading state); map/game screens scoped to the participation.
- **Build:** list `active` events → join (upsert participation) → scope gameplay; auto-select when a
  single active event exists.
- **Tests (first):** join creates exactly one participation; re-join idempotent; auto-select fires
  only for a single active event; screens read the selected event.
- **Done:** integration flow login → pick event → play works on the seeded event.

### Slice 6 — Admin role recognition + bootstrap docs

- **Files:** route/query gating for `role = 'admin'`; README.md + CLAUDE.md.
- **Build:** recognise the admin capability (gate admin-only access; the admin UI itself is SP2);
  document the out-of-band SQL bootstrap (`update public.profiles set role='admin' where id=...`).
- **Tests (first):** admin-gated access allowed for admin, denied for player/staff.
- **Done:** gating tests green; bootstrap documented.

## After SP1

- Revisit the SP3 staff spec to event-scope `completions` and replace `become_staff` with
  `staff_assignments`.
- Begin SP2 (admin authoring + visual map editor) — offer the visual companion at that point.

## Definition of done (SP1)

- All six slices merged; the seeded "AWS Cloud Quest" event is fully playable from DB-backed data
  with per-event progress; admin role recognised; no gameplay reads from `catalog.ts` or
  `profiles.progress`.
