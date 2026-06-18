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

The app reads **exactly two** environment variables (see `src/infrastructure/supabase-client.ts`).
Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-anon-public-key

# Optional · reserved for future storage. NOT read by any code yet — see "Storage buckets".
# NEXT_PUBLIC_SUPABASE_BUCKET=avatars
```

| Variable | Required | Where to find it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public` |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | No | Reserved placeholder for a future Supabase Storage bucket. No code reads it today; setting it has no effect until storage is implemented. |

Both are `NEXT_PUBLIC_*` because they are used by the browser client. The `anon` key is safe
to expose; row-level security and column grants enforce access control server-side.

If these are unset, `supabaseConfigured()` returns `false` and the app falls back to
localStorage-only mode (no cross-device persistence, no auth).

> Set the same two variables in your Vercel project (Settings → Environment Variables) for
> deployed environments.

## Storage buckets

**None.** This app does **not** use Supabase Storage.

- Avatars are generated in code (`src/presentation/components/sprites.tsx`), not stored files.
- All player state lives in the `profiles` table (the `progress` jsonb column), not in object storage.
- There are no `upload`, `getPublicUrl`, or `createBucket` calls anywhere in the codebase.

You do not need to create a bucket for the app to work today.

The optional `NEXT_PUBLIC_SUPABASE_BUCKET` variable above is a **reserved placeholder** only: if
file uploads (e.g. real avatar images) are added later, the bucket name will be read from `.env`
instead of hardcoded. Until that feature exists, the variable is unused and setting it does nothing.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates:
   - the `profiles` table (1:1 with `auth.users`) with RLS (owner-only access);
   - column-level grants — clients may only write `progress`, `base_id`, `updated_at`;
   - `become_staff(p_stand_id, p_access_code)` and `change_stand(p_stand_id)` security-definer RPCs;
   - a signup trigger that auto-creates a profile from auth metadata.
3. **Disable email confirmation**: Authentication → Providers → Email → turn off "Confirm email"
   (the signup flow logs the user in immediately).
4. **Set the staff access code**: edit the hardcoded `'4242'` in the `become_staff` function in
   `supabase/schema.sql` before each event, then re-run that function block.
5. Copy the Project URL and `anon` key into `.env.local` (see above).

### Staff roles

- A player becomes staff by calling the `become_staff` RPC with the event access code and a
  valid stand id (`cloud`, `ia`, `sec`, `crew`, `build`).
- `role` and `stand_id` are **write-locked** for clients (revoked column grants); they can only
  change through the security-definer RPCs. Direct column writes are rejected.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
```

If `npm run build` fails with `ENOENT .next/server/pages/_app.js.nft.json`, remove the build
cache and rebuild:

```bash
rm -rf .next && npm run build
```

## Project structure (Clean Architecture)

```
app/                         Next.js routes (login, register, staff, scanner, ...)
src/
  domain/                    types, catalog (stands, activities, stand access codes)
  application/               use cases + ports (approve-activity, ...)
  infrastructure/            supabase-client, supabase-game-repository, local-storage-...
  presentation/
    state/game-provider.tsx  auth lifecycle, debounced write-behind saves, legacy migration
    screens/ components/      UI + code-generated avatar sprites
supabase/schema.sql          DB schema, RLS, column grants, RPCs, signup trigger
```
