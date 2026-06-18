# SP2 — Admin authoring — implementation plan

- **Date:** 2026-06-18
- **Spec:** [`2026-06-18-sp2-admin-authoring-design.md`](./2026-06-18-sp2-admin-authoring-design.md)
- **Mode:** Strict TDD. **Delivery:** chained PRs, one per slice.
- **Depends on:** SP1 merged (DB-backed catalog, `admin` role, RLS admin-write policies).

## Prerequisite

Same remote Supabase test project as SP1 (see SP1 plan). No new environment setup.

## Slice ordering

```
S1 guard+shell ─> S2 events ─> S3 stands+map ─> S4 activities ─> S5 prizes
                                     └────────────────────────────> S6 staff assign
                  S2 ─────────────────────────────────────────────> S7 lifecycle
```

---

### Slice 1 — Admin guard + console shell

- **Files:** `/admin` layout + route guard; `src/infrastructure/supabase-admin-repository.ts` (stub).
- **Build:** redirect non-admins away from `/admin/*`; minimal nav shell.
- **Tests (first):** admin reaches `/admin`; player/staff are redirected; the guard reads
  `profiles.role`.
- **Done:** guard tests green; shell renders for admin.

### Slice 2 — Events CRUD

- **Files:** `/admin/events` (list + create), `/admin/events/[id]` (detail); admin repo event methods.
- **Build:** create/edit/list events; name/slug/description fields; admin-only writes via RLS.
- **Tests (first):** admin creates an event; duplicate slug rejected; non-admin write rejected; list
  shows only via admin.
- **Done:** event CRUD tests green.

### Slice 3 — Stands CRUD + visual map editor

- **Files:** `/admin/events/[id]/stands/[sid]` form; `/admin/events/[id]/map` editor component.
- **Build:** stand fields (name, tag, description, icon from fixed set, color/accent, piece reward);
  **map editor** — click-to-place / drag markers (tap + numeric inputs on mobile), persist
  `map_x`/`map_y` (0–100). *Offer the visual companion before building the editor layout.*
- **Tests (first):** create/edit a stand; coord range validation; placing/moving a marker updates
  coords; save persists position + fields; keyboard move works.
- **Done:** stand + map editor tests green.

### Slice 4 — Activities CRUD (per stand)

- **Files:** activities section of the stand form.
- **Build:** add/edit/remove/reorder activities; name, description, `points >= 0`, `special` flag.
  Reorder uses a transactional RPC (`admin_reorder_activities`).
- **Tests (first):** add activity; negative points rejected; reorder persists `sort`; duplicate slug
  per stand rejected.
- **Done:** activity tests green.

### Slice 5 — Prizes CRUD (per event)

- **Files:** `/admin/events/[id]/prizes`.
- **Build:** add/edit/remove prizes; name, `cost >= 0`, `stock >= 0`, `raffle` flag.
- **Tests (first):** add prize; negative cost/stock rejected; per-event isolation.
- **Done:** prize tests green.

### Slice 6 — Staff assignment

- **Files:** `/admin/events/[id]/staff`.
- **Build:** search a user by username → assign to event+stand (`staff_assignments` insert); list +
  unassign. No global role flip (staff is derived — see SP3).
- **Tests (first):** assign creates a unique row; re-assign blocked/idempotent; unassign removes;
  cross-event isolation.
- **Done:** staff-assignment tests green.

### Slice 7 — Event lifecycle

- **Files:** status control on `/admin/events/[id]`; player picker visibility (from SP1).
- **Build:** `draft → active → archived` transitions; destructive-edit warnings on `active` events;
  archived hidden from the player picker but data preserved.
- **Tests (first):** draft invisible to players; activating makes it joinable; archiving hides it;
  transition is admin-only.
- **Done:** lifecycle tests green.

## Definition of done (SP2)

- An admin can build a complete event end-to-end (event → stands on the map → activities → prizes →
  assigned staff → activate) without touching SQL, and a player can then join and play it.
