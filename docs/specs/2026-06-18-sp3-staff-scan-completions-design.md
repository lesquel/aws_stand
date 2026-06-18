# SP3 — Staff scan & completions (event-scoped) — design

- **Date:** 2026-06-18
- **Status:** Draft (pending spec review + user approval)
- **Project:** Cloud Quest (aws_stand)
- **Supersedes:** an earlier pre-multi-event staff-scan design (removed; see git history).
- **Roadmap position:** Sub-project 3 of 3. Depends on **SP1** (catalog in DB, `participations`,
  `staff_assignments`) and **SP2** (admin assigns staff to event+stand).

## Context

This is the original feature — invert the staff flow so staff register players from the staff
device — re-cast for the multi-event platform built in SP1/SP2. The pre-platform spec is superseded
because `completions` now hangs off a per-event `participation`, points come from the DB catalog, and
staff are assigned by an admin rather than self-enrolling with a shared code.

## Goals

- A staff member (assigned to an **event + stand**) registers players who completed an activity, from
  **their own device**.
- Player identity via **one global `player_code`**, input by **QR scan** (primary) or **manual
  entry** (fallback) — same RPC behind both.
- **Station mode:** pick one activity, then scan many players in a row.
- Each completion records **points + who approved + when**, scoped to the event.
- **Leaderboard per event**, ranked by points (time recorded for audit/tiebreak only).
- Build the full feature in one slice (QR + manual + leaderboard) — delivery approach **B**.

## Non-goals

- Speedrun/time-based scoring; offline scanning; cross-event aggregate leaderboards.

## Role model (finalised here)

- **Global roles become `player | admin`.** This **revises SP1's** `role check (player, staff,
  admin)` down to `(player, admin)`.
- **Staff is derived**: a user is staff *of an event+stand* iff a `staff_assignments` row exists for
  them. There is no global "staff" flag — a person can be staff at one event and a plain player at
  another.
- `become_staff` / `change_stand` RPCs are **removed**; staff binding is admin-managed (SP2).

## Data model changes

```sql
-- global, non-secret player identity for QR/manual entry
alter table public.profiles add column player_code text unique;   -- e.g. '7K2P9X', generated at signup

-- per-activity ledger (source of truth for awards), event-scoped via participation
create table public.completions (
  id              uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.participations(id) on delete cascade,
  stand_id        uuid not null references public.stands(id),
  activity_id     uuid not null references public.activities(id),
  points          int  not null,                 -- snapshot of activities.points at award time
  approved_by     uuid not null references public.profiles(id),  -- the staff user
  awarded_at      timestamptz not null default now(),
  unique (participation_id, activity_id)          -- idempotency: one award per activity per participation
);
```

- `participation_id` ties the completion to (player, event), so everything is event-scoped by
  construction.
- `player_code` lives on `profiles` (one QR works across events); the RPC resolves it to the
  participation in the staff's event.

## RPC: `approve_completion(p_player_code, p_stand_id, p_activity_id)`

`security definer`, granted to `authenticated`. Validation order:

1. Resolve the caller's `staff_assignments` row for `p_stand_id`; **reject if none** (caller is not
   staff of that stand). The assignment yields the `event_id`.
2. Verify `p_activity_id` belongs to `p_stand_id`.
3. Resolve `player_id` from `p_player_code`; reject if unknown.
4. **Ensure participation:** upsert the player's `participations` row for the event (**auto-join on
   first scan** so a staffer never gets blocked by "player hasn't joined").
5. Insert into `completions` with `points = activities.points` (authoritative, server-side),
   `approved_by = auth.uid()`, `awarded_at = now()`, `on conflict do nothing` (idempotent).
6. On a fresh award, update the participation cache (`tickets += points`, recompute pieces/badges).
7. Return `{ ok, already_awarded, points, player_username }` for the staff toast.

## UX

### Staff — station mode

1. Staff console lists the stands they are assigned to (from `staff_assignments`); pick one.
2. Pick one activity of that stand → **scan mode** (camera open). Each valid QR credits the player →
   toast `✓ Ana +1`, loop continues.
3. **"Type code"** button → manual entry fallback (camera denied/unavailable → auto-fallback).
4. Buttons to change the active activity and to switch assigned stand.

### Player

- Player screen shows their **QR** (encodes `player_code`) with the short **code printed below**.
- **Leaderboard** for the current event, ranked by points (derived from `completions`; time as a
  deterministic tiebreak).

## Removed / obsoleted

- `ApprovalModal` (player-device code entry) and the player-types-code path.
- `approveActivity` use case and the `approve` action.
- `become_staff` / `change_stand` RPCs.
- `Stand.staffCode` (already removed when the catalog moved to the DB in SP1).

## Dependencies

- QR **generation** (player) and **scanning** (staff) libs — `qrcode` + (`@zxing/library` or
  `html5-qrcode`). Must work on mobile and degrade to manual entry.

## Security

- Validation fully server-side by **assignment** (no shared secret in the client). Closes the legacy
  `staffCode`-in-bundle leak for good.
- `completions` is RPC-write-only; players cannot self-award.
- `player_code` is non-secret; its only capability is "a staff member may credit me in their event".
- **Cross-event isolation:** a staffer assigned to event A cannot credit a player's participation in
  event B (the assignment fixes the event).

## Testing (TDD)

- staff of the stand → credits; staff of a different stand/event → rejected; non-staff → rejected;
- activity not belonging to the stand → rejected; unknown `player_code` → rejected;
- player not yet joined → **auto-join** then credit;
- double scan of same activity/participation → idempotent (`already_awarded`);
- cross-event: assignment in event A cannot touch event B;
- `player_code` generation (format, uniqueness/collision retry);
- leaderboard ordering by points within an event (time tiebreak).

## Risks & mitigations

- **Camera permissions (approach-B risk):** QR and manual share one RPC, so the manual path is always
  testable and the feature stays usable when the camera fails.
- **Auto-join surprises:** a mistaken scan auto-joins a player to an event. Mitigation: completions
  are auditable (`approved_by`, `awarded_at`); admin can review. Acceptable for an event kiosk flow.
