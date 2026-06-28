# CLAUDE.md — Cloud Quest

Project-specific guidance for working in this repository.

## What this is

A gamified event app: **Next.js 14 App Router + TypeScript (strict) + Supabase (Auth + Postgres)**.
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
- All player state is the `profiles.progress` jsonb column (Postgres), not object storage.
- No `upload` / `getPublicUrl` / `createBucket` calls exist in the codebase.
- `NEXT_PUBLIC_SUPABASE_BUCKET` exists in the docs only as a reserved placeholder for if/when file
  uploads are added; it is currently read by nothing.

## Supabase

- Schema lives in `supabase/schema.sql`. Apply via Dashboard → SQL Editor.
- `profiles` table is 1:1 with `auth.users`, owner-only RLS.
- Clients may only write `progress`, `base_id`, `updated_at` (column grants). `role`, `stand_id`,
  and `username` are write-locked.
- Role escalation and stand assignment go **only** through security-definer RPCs:
  `become_staff(p_stand_id, p_access_code)` and `change_stand(p_stand_id)`.
- The staff access code is hardcoded as `'4242'` inside `become_staff` — change it per event.
- Valid stand ids: `cloud`, `ia`, `sec`, `crew`, `build`.
- Email confirmation must be **disabled** in Supabase Auth (signup logs in immediately).
- **Admin bootstrap:** there is no in-app admin promotion. The `handle_new_user` signup trigger
  grants `role = 'admin'` when the new user's email is in the service-role-only `admin_allowlist`
  table. Populate it from `ADMIN_EMAILS` via `npm run seed:admin`, then have the allowlisted person
  sign up normally. The app maps DB `admin` → app `admin` (`toAppRole`) and guards the `/admin`
  route (placeholder UI; the full console is SP2). DB `participant` maps to app `player`.
- **Multi-event:** the live schema (`supabase/migrations/`) has superseded the single-event
  `supabase/schema.sql`. Identity is in `profiles`; per-event progress is in `participations`; the
  catalog is event-scoped. Treat the migrations dir as the source of truth for the current schema.

## Conventions

- **Persona voice is for chat only.** Code, comments, UI copy, and docs are English by default;
  in-app UI strings are **neutral Spanish (no voseo)** to match existing tone.
- The four original avatar ids (`explorer`, `aqua`, `nova`, `robo`) must never change — they are
  persisted in old saves.
- Commit with the git-configured identity (Lesquel), conventional commits, no AI attribution.
- TypeScript strict. Keep `@types/react` pinned to v18 (runtime is react@18.3.1).
- Saves are debounced write-behind with a user-id check; legacy localStorage is cleared only after
  a successful upload.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build (rm -rf .next first if .nft.json ENOENT appears)
npm run start    # serve production build
```

## Known follow-ups / pending

- RPCs, column grants, and RLS in `supabase/schema.sql` are unverified against a live DB.
- Per-stand approval codes still live in the client bundle (`src/domain/catalog.ts`) — candidate
  for a server-side `approve_activity` RPC (current design lets a player read all codes via devtools).
- `create-player.ts` may be dead code after `onCreate` removal — verify and clean up.
