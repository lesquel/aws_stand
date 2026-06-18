# Staff scan & completions — design

- **Date:** 2026-06-18
- **Status:** ⚠️ **SUPERSEDED** by [`2026-06-18-sp3-staff-scan-completions-design.md`](./2026-06-18-sp3-staff-scan-completions-design.md).
  This was the pre-multi-event version. The scope grew to a multi-event platform (SP1/SP2), so
  `completions` now hangs off a per-event `participation`, points come from the DB catalog, and staff
  are admin-assigned (no shared code). Kept for history; **do not implement from this doc** — use SP3.
- **Project:** Cloud Quest (aws_stand)
- **Delivery approach:** B — build the full feature in one slice (QR + manual fallback + leaderboard), all behind a single server-side RPC.

## Context & problem

Today the staff/approval flow is **inverted** from the intended event model:

- The staff walks to the **player's** phone and types the stand's 4-digit `staffCode`.
- The staff console (`src/presentation/screens/staff.tsx`) only **displays** that code.
- Per-stand codes ship in the **client bundle** (`src/domain/catalog.ts` → `Stand.staffCode`),
  so any player can read every code via devtools. This is an open security hole.
- `progress.doneActivities` is a flat `string[]` with **no timestamp and no record of who approved**.

The intended model: a staff member is tied to a stand and, from **their own device**, registers
the players who completed an activity at that stand — scanning a QR (or typing a short code), with
points and the time of completion recorded.

## Goals

- Staff registers completions from the staff device (flow inversion).
- Validation is **server-side by staff role**, not by a client-side shared code.
- Each completion records **who approved it** and **when** (`approved_by`, `awarded_at`).
- Player identity via **one short code**, input either by **QR scan** (primary) or **manual entry** (fallback).
- Staff "station mode": pick one activity once, then scan many players in a row.
- Points (tickets) feed a **leaderboard ranked by points**; time is recorded but does not affect score.

## Non-goals

- Speedrun/time-based ranking (time is recorded only; not used for scoring).
- Offline scanning / sync. Requires connectivity at scan time.
- Changing the existing prize/claim or piece/badge mechanics beyond reading the new points source.

## Decisions (locked during brainstorming)

1. **Flow inversion.** Remove `Stand.staffCode`, the `ApprovalModal` on the player device, and the
   `approveActivity` use case. Staff validates server-side.
2. **Single identity, two inputs.** New `profiles.player_code` (short, unique, non-secret, e.g.
   `7K2P9X`). The QR encodes this same code; manual entry types it. Knowing a code grants nothing —
   only a staff member can use it to credit points.
3. **Station mode.** Staff selects one activity, then enters a continuous scan loop crediting that
   activity to each scanned player.
4. **Ledger table `completions`** is the source of truth for awards (timestamp + approver). The
   `progress` jsonb stays as a derived cache.
5. **Leaderboard by points.** Reuses tickets. Time stored for audit/tiebreak only.

## Data model

### `profiles` (add one column)

```sql
alter table public.profiles
  add column player_code text unique;
```

- Generated at signup inside `handle_new_user()` (short base32, collision-retry).
- Non-secret; surfaced to the player so they can show the QR or dictate the code.

### `completions` (new table)

```sql
create table public.completions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles(id) on delete cascade,
  stand_id    text not null,
  activity_id text not null,
  points      int  not null,
  approved_by uuid not null references public.profiles(id),
  awarded_at  timestamptz not null default now(),
  unique (player_id, stand_id, activity_id)   -- idempotency at the DB level
);
```

- The `unique` constraint makes a double-scan of the same activity for the same player a no-op.
- `points` is denormalized from the catalog at award time so historical points are stable even if
  the catalog changes.

### RLS

- `completions`: a player may `select` their own rows (`player_id = auth.uid()`). **No direct
  `insert`/`update`/`delete` grant** — writes happen only through the security-definer RPC.
- `profiles.player_code` is covered by existing owner-only select; it is non-secret but not exposed
  to other users through RLS.

## RPC: `approve_completion(p_player_code, p_stand_id, p_activity_id)`

`security definer`, granted to `authenticated`. Validation order:

1. Caller is `staff` **and** caller's `stand_id` == `p_stand_id` (else reject — staff can only credit
   their own stand).
2. `p_activity_id` belongs to `p_stand_id` (validated against a server-side activity map).
3. Resolve `player_id` from `p_player_code` (reject if no such code).
4. Insert into `completions` with `approved_by = auth.uid()`, `awarded_at = now()`, `points` from the
   server-side activity map. `on conflict do nothing` for idempotency.
5. Return a result: `{ ok, already_awarded, points, player_username }` so the staff UI can show a toast.

> The server-side activity → points map must exist in the DB (the catalog can't be trusted from the
> client). Stand/activity ids and their `tickets` are mirrored into the RPC (or a small reference
> table) so points are authoritative server-side.

## Removed / obsoleted

- `Stand.staffCode` field and all per-stand codes in `catalog.ts`.
- `ApprovalModal` on the player device and the player-types-code path.
- `approveActivity` use case (`src/application/approve-activity.ts`) and the `approve` action.
- The legacy `/scanner` redirect becomes the real staff scanner.

## Staff UX — station mode

1. Staff console shows the assigned stand and its activities.
2. Staff taps an activity → enters **scan mode** for that activity.
3. Camera opens; each valid QR credits the player → toast `✓ Ana +1` and the loop continues.
4. A **"type code"** button opens manual entry (fallback when the camera is unavailable/denied).
5. Buttons to change the active activity and to change stand.
6. Permission denied / no camera → automatically fall back to manual entry (feature stays usable).

## Player UX

- Player screen shows their **QR** (encodes `player_code`) with the short **code printed below** it
  so they can dictate it.
- **Leaderboard** ranked by total points (derived from `completions`), built in the same slice.

## Dependencies

- QR **generation** (player side) and QR **scanning** (staff side). Candidate libs: `qrcode` for
  generation; `@zxing/library` or `html5-qrcode` for scanning via `getUserMedia`. Final choice at
  implementation; both must work on mobile browsers and degrade to manual entry.

## Security

- Validation is fully server-side by role; no shared secret in the client bundle (closes the
  current `staffCode` leak).
- `completions` is RPC-write-only; players cannot self-award.
- `player_code` is non-secret by design; its only capability is "a staff member may credit me".

## Testing (TDD)

RPC (integration against the DB):

- staff of the stand → credits successfully;
- staff of a **different** stand → rejected;
- non-staff caller → rejected;
- activity that does not belong to the stand → rejected;
- unknown `player_code` → rejected;
- double scan of the same activity/player → idempotent no-op (`already_awarded`).

Unit:

- `player_code` generation (format, uniqueness/collision retry);
- progress cache recompute from `completions`;
- leaderboard ordering by points (with time as a deterministic tiebreak).

## Risks & mitigations

- **Camera permissions (the approach-B risk).** Both QR and manual hit the same RPC, so the manual
  path is always testable and the feature stays usable when the camera fails. Camera is gated behind
  permission with automatic fallback to manual.
- **Catalog/points trust.** Points must be authoritative server-side; the client catalog is display-only.

## Open question carried forward

- `player_code` is a readable unique code (recommended). Alternative: encode the raw `auth.users`
  uuid in the QR with a separate manual code. Chosen: readable single code.
