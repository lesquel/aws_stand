# CLAUDE.md — Cloud Quest

Project-specific guidance for working in this repository.

## What this is

A gamified event app: **Next.js 16 App Router + TypeScript (strict) + Supabase (Auth + Postgres)**.
Players build an avatar, visit stands, complete activities, collect pieces/badges. Staff validate
activities at their assigned stand. Architecture is Clean/Hexagonal (domain / application /
infrastructure / presentation).

## Environment variables

The **browser app** reads **exactly two** env vars (`src/infrastructure/supabase-client.ts`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The app runtime has no other `process.env.*` references. Both are public (browser client); access
control is enforced by RLS + column grants, not by hiding the key. Without them the app runs in
localStorage-only fallback (`supabaseConfigured()` returns `false`).

Two additional vars are **server-side only** — read by integration tests and tooling, never bundled
into the browser:

- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; used by the test harness (`test/helpers/supabase.ts`)
  and the admin allowlist seed. Never expose it client-side.
- `ADMIN_EMAILS` — comma-separated emails seeded into `admin_allowlist` via `npm run seed:admin`
  (`scripts/seed-admin-allowlist.ts`). Do not print its value. Not read by the app runtime.

An optional `NEXT_PUBLIC_SUPABASE_BUCKET` is documented as a **reserved placeholder** for future
storage. No code reads it today — do not treat it as active config until file uploads are built.

Local: `.env.local` in the project root. Deployed: the two `NEXT_PUBLIC_*` vars in Vercel project
settings (the server-side vars are for tests/tooling, not the deployed runtime).

## Storage buckets

**None — and do not add one.** No Supabase Storage is used anywhere:

- Avatars are code-generated SVG sprites (`src/presentation/components/sprites.tsx`), not files.
- All player state is per-event `participations` jsonb/int columns (Postgres), not object storage.
- No `upload` / `getPublicUrl` / `createBucket` calls exist in the codebase.
- `NEXT_PUBLIC_SUPABASE_BUCKET` exists in the docs only as a reserved placeholder for if/when file
  uploads are added; it is currently read by nothing.

## Supabase

- **Schema lives in `supabase/migrations/` (0001–0010, applied in order). `supabase/schema.sql` is
  DEPRECATED** — it describes the old single-event model and no code or tooling reads it. Never
  apply it; it exists only for historical reference.
- **Multi-event model:** `events → stands → activities (one per stand, RN-03) → badges (one per
  activity, RN-04)`, plus `prizes` — all event-scoped. `profiles` holds identity only (email unique,
  `qr_token` unique, `username` display-only non-unique). Per-event player state lives in
  `participations` (`tickets`, `pieces`, `badges`, `claimed`, `done_activities`).
- **Roles:** `participant | staff | admin` (DB) → mapped to app `player | staff | admin`
  (`toAppRole` in `supabase-game-repository.ts`). Staff is **admin-assigned**, not self-enrolled:
  `staff_assignments(staff_id, event_id, stand_id)` says who staffs what. There is no client
  write-path to `profiles.role` — it's set once at signup (see Admin bootstrap) and never changed
  by the client afterward.
- **All gameplay mutation is server-side**, via `SECURITY DEFINER` RPCs only — `participations` has
  **no client INSERT/UPDATE grant** (revoked in migration `0008`; the SP1-era self-mutation hole is
  closed). The only ways a client changes `participations` are:
  - `join_event(p_event_id)` — join an active event with a clean ledger.
  - `approve_completion(p_qr_token, p_activity_id, p_position?)` — staff scans a player's QR to
    credit points/badge/piece for one activity (idempotent, cross-event/cross-stand isolated via
    `staff_assignments`).
  - `correct_points(p_participation_id, p_new_tickets, p_reason)` — admin/staff-of-event corrects a
    total, with an append-only audit trail in `point_corrections`.
  - `claim_prize(p_event_id, p_prize_slug)` — atomic, race-safe (`FOR UPDATE`) prize redemption.
  - `admin_upsert_stand(payload)` — atomic stand+activity+badge create/update (no orphan rows on
    partial failure).
  - `validate_winner(p_qr_token, p_event_id)` and `event_leaderboard(p_event_id)` are read-only.
  - `is_admin()` is the helper every admin-write RLS policy checks; `EXECUTE` is granted only to
    `authenticated` (not `anon`) — see migration `0010`.
- Email confirmation must be **disabled** in Supabase Auth (signup logs in immediately).
- **Admin bootstrap:** there is no in-app admin promotion. The `handle_new_user` signup trigger
  grants `role = 'admin'` when the new user's email is in the service-role-only `admin_allowlist`
  table (RLS-locked, no client read/write). Populate it from `ADMIN_EMAILS` via `npm run seed:admin`,
  then have the allowlisted person sign up normally. The admin console (`/admin`) covers events,
  stands + a visual map editor, prizes, staff/participant account management (via server-only
  `app/api/admin/*` routes using the service-role key — never in the client bundle), point
  corrections, and winner validation.
- Realtime is enabled on `participations` (migration `0009`) so a player's own screen updates live
  after a staff scan, without a manual reload; RLS still scopes delivery to the owner's row.

## Conventions

- **Persona voice is for chat only.** Code, comments, UI copy, and docs are English by default;
  in-app UI strings are **neutral Spanish (no voseo)** to match existing tone.
- The four original avatar ids (`explorer`, `aqua`, `nova`, `robo`) must never change — they are
  persisted in old saves.
- Commit with the git-configured identity (Lesquel), conventional commits, no AI attribution.
- TypeScript strict. Keep `@types/react`/`@types/react-dom` matching the runtime `react`/`react-dom`
  major (currently 19.x, via Next 16) — a version-skewed `@types/react` compiles fine but can hide
  real runtime incompatibilities. Bump types and runtime together, never one without the other.
- There is no client write-behind to `participations` anymore — the client only reads it (plus a
  live Realtime refetch on change). All gameplay writes go through the RPCs listed above.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build (rm -rf .next first if .nft.json ENOENT appears)
npm run start    # serve production build
```

## Known follow-ups / pending

- Deleting a stand that already has `completions` history hits a foreign-key error, mapped to a
  friendly message telling the admin to archive the event instead — hard-deleting a stand with
  history isn't supported by design (no cascade there is intentional data-loss protection).
- Dependency hygiene: Next.js is pinned at 14.2.35, which has known advisories; upgrading to a newer
  major is a deliberate, separate decision (breaking changes), not a drive-by bump.
