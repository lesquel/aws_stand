# SP2 — Admin authoring — design

- **Date:** 2026-06-18
- **Status:** Draft (pending spec review + user approval)
- **Project:** Cloud Quest (aws_stand)
- **Roadmap position:** Sub-project 2 of 3. Depends on **SP1** (DB-backed catalog + `admin` role).
  - SP1 — Multi-event foundation (done as design+plan).
  - **SP2 — Admin authoring (this doc).**
  - SP3 — Staff scan & completions.

## Context

SP1 moves the catalog into the DB (`events → stands → activities`, `prizes`, `staff_assignments`)
and recognises the `admin` capability, but provides **no UI** to author content — events/stands are
created via `seed.sql`. SP2 gives admins a console to build and run events without SQL.

## Goals

- Admin console (gated to `role = 'admin'`) to **CRUD** events, stands, activities/games, and prizes.
- **Visual map editor**: place/move stands on the event map by clicking/dragging; persist
  `map_x`/`map_y`.
- **Assign staff** to an event + stand.
- **Event lifecycle**: `draft → active → archived` (only `active` events are visible/joinable to
  players).
- All writes authorised server-side (admin-only RLS from SP1, optionally via SECURITY DEFINER RPCs).

## Non-goals

- Player gameplay (SP1) and staff scanning/`completions` (SP3).
- **Image uploads.** Stand icons/colors are chosen from the **existing fixed icon set + palette**;
  the map background is a **shared, code-provided image**. This keeps the project **bucket-free**
  (consistent with README/CLAUDE.md). *Per-event custom map images or uploaded icons would require a
  Supabase Storage bucket — explicitly deferred (see "Open questions").*
- Rich analytics/reporting dashboards.
- Multi-admin permissions / per-event organiser roles (admin is a single global capability).

## Information architecture

```
/admin                     guard: role === 'admin' (else redirect)
  /admin/events            list events (+ create)
  /admin/events/[id]       event detail: status control, stands list, prizes list, staff
    /admin/events/[id]/map        visual map editor (stands placement)
    /admin/events/[id]/stands/[sid]   stand form (name, desc, icon, color, piece, activities)
    /admin/events/[id]/prizes         prizes CRUD
    /admin/events/[id]/staff          staff assignment
```

## Components & data flow

- **Route guard:** a server/client check reads the caller's `profiles.role`; non-admins are
  redirected. Defence-in-depth: RLS already blocks writes for non-admins, so the guard is UX, not the
  security boundary.
- **Forms → DB:** each form maps 1:1 to a table from SP1. Writes go through a thin admin repository
  (`src/infrastructure/supabase-admin-repository.ts`) using either RLS-guarded table writes or
  SECURITY DEFINER RPCs (`admin_upsert_stand`, etc.) where multi-row/transactional integrity is
  needed (e.g. reordering activities). Decision: **RLS-guarded direct writes for single-row CRUD;
  RPCs only for transactional/multi-row operations.**
- **Validation (boundary):** unique `slug` per parent, `points >= 0`, `cost >= 0`, `stock >= 0`,
  `map_x`/`map_y` within `0–100`, required name. Validate client-side for UX **and** rely on DB
  constraints/RLS as the authority.

## Visual map editor

- Renders the shared map background with a marker per stand at its `(map_x, map_y)` percent position.
- **Place:** click an empty spot with a stand selected → sets that stand's coords. **Move:** drag a
  marker → updates coords. Coordinates are percentages (matches the existing `map: {x, y}` model).
- A side panel shows the selected stand's form (name, tag, description, icon, color/accent, piece
  reward, activities summary). Saving persists position + fields together.
- Mobile: tap-to-place fallback (no drag) so it works on a phone.
- **Reduced-motion / a11y:** markers are focusable, movable with arrow keys, labelled by stand name.

> This is the visual centrepiece. When implementation starts, offer the **visual companion** to
> mock the editor layout before building.

## Staff assignment

- Admin selects an event + stand, searches a user by **username**, and assigns them → inserts a
  `staff_assignments(staff_id, event_id, stand_id)` row (unique).
- **Staff-ness is derived from having an assignment** (see SP3, which finalises the role model:
  global roles become `player | admin`; "staff" = has ≥1 assignment). SP2 therefore **does not flip a
  global role** — assigning a user to a stand is sufficient to make them staff of that stand.
- Admin can unassign (delete the row) and list current assignments per stand.

## Event lifecycle

- `draft`: editable, invisible to players.
- `active`: visible/joinable; still editable (edits apply live — warn the admin).
- `archived`: read-only, hidden from the player picker; participations/leaderboard preserved.
- Transitions are admin-only; guard against two `active` events only if the product wants a single
  live event (decision: **allow multiple active events** — the picker already supports it).

## Testing (TDD)

- **Guard:** `/admin/*` allows admin, redirects player/staff.
- **RLS (integration):** admin CRUD succeeds; non-admin writes rejected (mostly inherited from SP1,
  re-asserted per table).
- **Validation:** duplicate slug rejected; out-of-range map coords rejected; negative points/cost
  rejected.
- **Map editor (component):** placing/moving a marker updates the stand's coords; save persists;
  keyboard move works.
- **Staff assignment (integration):** assign creates a unique row; re-assign idempotent/blocked;
  unassign removes it; the assigned user is then recognised as staff of that stand (consumed in SP3).
- **Lifecycle:** draft not visible to players; activating makes it joinable; archiving hides it.

## Risks

- **Live edits to an active event** can confuse in-progress players (e.g. deleting a stand someone is
  mid-activity on). Mitigation: soft warnings on destructive edits to `active` events; prefer
  `archived` over hard delete when participations exist.
- **Map editor on mobile** is fiddly. Mitigation: tap-to-place + numeric coord inputs as fallback.

## Open questions

- **Per-event map background image** (different venue per event) → would require a Storage bucket and
  upload flow. Deferred; revisit if a real event needs a custom map. *This is the one feature that
  would change the current "no buckets" stance.*
- **Custom stand icons** beyond the fixed set → also a bucket/upload concern; deferred.
- Whether to hard-cap a single `active` event (currently: no cap).
