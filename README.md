# Cloud Quest

A gamified event app built with **Next.js 14 (App Router)** + **TypeScript (strict)** + **Supabase**.
Players create an avatar, visit event stands, complete activities, and collect pieces/badges.
Staff members validate player activities at their assigned stand.

## Stack

- Next.js 14 (App Router, file-based routing)
- TypeScript strict mode
- Supabase (Auth + Postgres) for identity and persistence
- Avatars rendered as **code-generated SVG sprites** (no image assets, no uploads)

## Requirements

- Node.js 18+
- npm (the repo uses `package-lock.json`; ignore any stray `bun.lock`)
- A Supabase project

## Environment variables

The **browser app** reads **exactly two** environment variables (see
`src/infrastructure/supabase-client.ts`). Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-anon-public-key

# Server-side only (NOT public, never bundled into the client). Used by the
# integration tests and the `npm run seed:admin` tooling, not by the app runtime.
SUPABASE_SERVICE_ROLE_KEY=YOUR-service-role-key
ADMIN_EMAILS=admin@example.com,other-admin@example.com

# Optional · reserved for future storage. NOT read by any code yet — see "Storage buckets".
# NEXT_PUBLIC_SUPABASE_BUCKET=avatars
```

| Variable | Required | Where to find it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side | Supabase Dashboard → Project Settings → API → Project API keys → `service_role` `secret`. **Never** expose this in the browser. Used only by integration tests and the admin allowlist seed. |
| `ADMIN_EMAILS` | Server-side | Comma-separated list of emails that should become admins. Seeded into the `admin_allowlist` table via `npm run seed:admin`. Not public, not read by the app runtime. |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | No | Reserved placeholder for a future Supabase Storage bucket. No code reads it today; setting it has no effect until storage is implemented. |

The two `NEXT_PUBLIC_*` variables are used by the browser client. The `anon` key is safe
to expose; row-level security and column grants enforce access control server-side. The
`SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_EMAILS` variables are **server-side only** — they are
consumed by tests and tooling, never shipped to the browser.

If these are unset, `supabaseConfigured()` returns `false` and the app falls back to
localStorage-only mode (no cross-device persistence, no auth).

> Set the same two variables in your Vercel project (Settings → Environment Variables) for
> deployed environments.

## Storage buckets

**None.** This app does **not** use Supabase Storage.

- Avatars are generated in code (`src/presentation/components/sprites.tsx`), not stored files.
- All player state lives in the per-event `participations` table (Postgres), not in object storage.
- There are no `upload`, `getPublicUrl`, or `createBucket` calls anywhere in the codebase.

You do not need to create a bucket for the app to work today.

The optional `NEXT_PUBLIC_SUPABASE_BUCKET` variable above is a **reserved placeholder** only: if
file uploads (e.g. real avatar images) are added later, the bucket name will be read from `.env`
instead of hardcoded. Until that feature exists, the variable is unused and setting it does nothing.

## Supabase setup

1. Create a Supabase project.
2. Apply every file in [`supabase/migrations/`](supabase/migrations/) **in order** (`0001` through
   the highest number), via the Dashboard SQL Editor or `supabase db push`. This creates the full
   multi-event schema: `events → stands → activities (one per stand) → badges (one per activity)`,
   `prizes`, `profiles` (identity: unique email, unique `qr_token`), `participations` (per-event
   progress, no client write grant — mutated only by RPCs), `staff_assignments`,
   `admin_allowlist`, `completions` (award ledger), `point_corrections` (audit trail), plus the
   RPCs listed in `CLAUDE.md` (`join_event`, `approve_completion`, `correct_points`, `claim_prize`,
   `admin_upsert_stand`, `validate_winner`, `event_leaderboard`, `is_admin`).
   Then run [`supabase/seed.sql`](supabase/seed.sql) to create one default active event so the app
   isn't empty. **`supabase/schema.sql` is DEPRECATED** — it's the old single-event model; don't
   apply it.
3. **Disable email confirmation**: Authentication → Providers → Email → turn off "Confirm email"
   (the signup flow logs the user in immediately).
4. Copy the Project URL and `anon` key into `.env.local` (see above).

### Staff roles

- Staff are **not** self-enrolled. An admin creates a staff account and assigns them to an
  event + stand (`/admin` → Staff), via a server-only route using the service-role key.
- `role` is write-locked for clients; a staff member is only ever bound to a stand through
  `staff_assignments`, which only an admin can write.

### Admin roles (allowlist bootstrap)

Admins are not promoted from inside the app — there is no client path to write `role`. Instead,
the role is granted at **signup time** from a server-side allowlist:

1. Put the admin's email in `ADMIN_EMAILS` (comma-separated, server-side, non-public).
2. Run `npm run seed:admin` to upsert those emails into the `admin_allowlist` table (service-role
   only — clients cannot read or write it). The command is idempotent; re-run it whenever
   `ADMIN_EMAILS` changes.
3. The allowlisted person **signs up normally** with that email. The `handle_new_user` signup
   trigger sees the email in `admin_allowlist` and creates the profile with `role = 'admin'`.
4. The app recognizes the admin role and redirects to the guarded `/admin` console: Events, Stands
   (with a visual map editor), Prizes, Staff, Participants, Point corrections, and Winner
   validation — all backed by real RLS/RPC authorization, not just a client-side redirect.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm test         # run the integration test suite (Vitest, real Supabase)
npm run seed:admin  # upsert ADMIN_EMAILS into the admin_allowlist table
```

If `npm run build` fails with `ENOENT .next/server/pages/_app.js.nft.json`, remove the build
cache and rebuild:

```bash
rm -rf .next && npm run build
```

## Project structure (Clean Architecture)

```
app/                          Next.js routes (login, register, home, stand/[id], staff, admin,
                               leaderboard, api/admin/{staff,participants})
src/
  domain/                     types, catalog seed payload + badge rules
  infrastructure/             supabase-client, supabase-*-repository.ts (catalog, participation,
                               leaderboard, prize, corrections, winner), supabase-admin-*-server.ts
                               (server-only, service-role — never imported by client components)
  presentation/
    state/game-provider.tsx   auth lifecycle, async catalog, per-event progress, Realtime refetch
    screens/                  player screens (map/stand/avatar/leaderboard), staff.tsx (station
                               console), screens/admin/ (7 sections: events, stands+map, prizes,
                               staff, participants, corrections, winners)
    components/               qr-scanner.tsx, winner-validation.tsx (shared admin+staff)
supabase/
  migrations/0001-00NN...sql  DB schema, RLS, RPCs, signup trigger — source of truth
  seed.sql                    default active event bootstrap
  schema.sql                  DEPRECATED — old single-event model, not applied by anything
test/sp1/ sp2/ sp3/           integration tests (real Supabase; run per-file — the full suite trips
                               Supabase's auth rate limit)
```
