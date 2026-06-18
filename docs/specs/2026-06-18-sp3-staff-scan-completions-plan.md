# SP3 — Staff scan & completions — implementation plan

- **Date:** 2026-06-18
- **Spec:** [`2026-06-18-sp3-staff-scan-completions-design.md`](./2026-06-18-sp3-staff-scan-completions-design.md)
- **Mode:** Strict TDD. **Delivery:** chained PRs, one per slice. Approach **B** (full feature) is
  still sliced for testability.
- **Depends on:** SP1 (participations, catalog in DB) and SP2 (admin-assigned staff).

## Prerequisite

Same remote Supabase test project as SP1/SP2. QR libs added in S4.

## Slice ordering

```
S1 roles+player_code ─> S2 completions+RPC ─> S3 staff scan (manual) ─> S4 QR layer
                                          └─> S5 leaderboard
S2/S3 ─> S6 remove legacy
```

---

### Slice 1 — Finalise role model + `player_code`

- **Files:** migration; signup trigger; any `role` reads in app.
- **Build:** roles → `player | admin` (revise SP1's enum); drop `become_staff`/`change_stand`; add
  `profiles.player_code` (unique, generated in `handle_new_user` with collision retry); staff-ness
  derived from `staff_assignments`.
- **Tests (first):** `player_code` format + uniqueness/collision retry; a user with a
  `staff_assignment` is recognised as staff; role enum no longer accepts `'staff'`.
- **Done:** migration applies; role/code tests green.

### Slice 2 — `completions` table + `approve_completion` RPC (core)

- **Files:** migration (table + RPC + RLS).
- **Build:** `completions` ledger; `approve_completion(p_player_code, p_stand_id, p_activity_id)`
  SECURITY DEFINER per the spec (assignment check → activity-belongs-to-stand → resolve player →
  auto-join participation → idempotent insert with authoritative points → update participation
  cache).
- **Tests (first):** staff of stand credits; different stand/event rejected; non-staff rejected;
  foreign activity rejected; unknown code rejected; not-joined → auto-join then credit; double scan
  idempotent; **cross-event isolation** (event A assignment can't touch event B); RLS makes
  `completions` RPC-write-only.
- **Done:** all RPC tests green. **This is the highest-risk slice — review it hardest.**

### Slice 3 — Staff scan UI, manual path first

- **Files:** staff console (station mode); manual code entry.
- **Build:** list assigned stands → pick activity → scan mode with **manual entry** wired to the RPC;
  toast `✓ Ana +1`; change activity / stand.
- **Tests (first):** manual entry credits via the RPC; toast on success; `already_awarded` shows a
  distinct state; switching activity works.
- **Done:** manual-path station mode works end-to-end.

### Slice 4 — QR layer

- **Files:** player QR component; staff camera scanner; deps (`qrcode` + scanner lib).
- **Build:** player shows QR (encodes `player_code`) + printed code; staff camera scans → same RPC;
  camera denied/unavailable → auto-fallback to manual (from S3).
- **Tests (first):** QR encodes the code; a decoded code drives the same credit path; permission
  denied falls back to manual without breaking the loop.
- **Done:** QR + manual both credit through one RPC; graceful fallback verified.

### Slice 5 — Leaderboard (per event)

- **Files:** player-facing leaderboard screen; query/view over `completions`.
- **Build:** rank participants by points within the event (time as deterministic tiebreak).
- **Tests (first):** ordering by points; tiebreak by earliest; scoped to the current event only.
- **Done:** leaderboard tests green.

### Slice 6 — Remove legacy

- **Files:** delete `ApprovalModal`, `approve-activity.ts`, the `approve` action; remove
  `become_staff`/`change_stand` UI; drop any remaining `staffCode` references.
- **Tests (first):** no consumer references the removed symbols; player self-complete path no longer
  exists where it should be staff-gated.
- **Done:** dead code gone; build + full suite green.

## Definition of done (SP3)

- Staff (admin-assigned) credit players via QR or manual entry in station mode; completions are
  event-scoped, idempotent, auditable (who/when), with authoritative points; players see a per-event
  leaderboard; all legacy self-approval code removed.
