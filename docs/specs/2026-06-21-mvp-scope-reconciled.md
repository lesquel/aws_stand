# Cloud Quest — MVP scope (reconciled) — authoritative requirements

- **Date:** 2026-06-21
- **Status:** Authoritative for the MVP. On any conflict with an earlier sub-project design
  (`*-sp1/sp2/sp3-*`), **this document wins**; the sub-project specs are the implementation breakdown
  and will be revised to match as each sub-project starts.
- **Source:** the client MVP scope document + reconciliation decisions from the brainstorming dialogue.

## 1. What this is

A gamified, single-day event app. Participants register, log in, view stands/rules, show a unique QR,
earn points and badges. Staff scan the participant's QR, register the completed activity and assign
points per the activity's rule. A public ranking is shown. At close, staff/admin validate winners by
QR, points and badges. Admins build the whole event (map, stands, activities, badges, prizes, staff)
from a console.

The platform structure remains **multi-event** (events → stands → activities, per-event progress);
the MVP runs one event, but the model supports many.

## 2. Confirmed decisions (reconciliation)

- **Registration/login:** name + email + password; login with email + password. **No email code**
  (email confirmation stays disabled). Matches CA-01.
- **Identity:** **email is the unique identifier** + a unique `qr_token` per user. **`name` is a
  display field (not unique)** — the earlier "unique username" requirement is **dropped**.
- **Roles are explicit: `participant | staff | admin`** (reverts the earlier "staff is derived"
  decision).
- **Staff accounts are created by the admin** (not self-signup). Creating accounts for others
  requires a **server-side endpoint using the Supabase service-role key** (the browser client cannot
  create other users). Same mechanism powers admin management of participant accounts (CA-09).
- **Admin grant** still uses the env **email allowlist** (`ADMIN_EMAILS` → `admin_allowlist`); an
  allowlisted email that signs up becomes admin.
- **One stand = one activity** (RN-03) — simplifies the prior multi-activity-per-stand model.
- **Storage:** still **no buckets** (avatars are code sprites; stand icons from a fixed set; shared
  map background). Unchanged.

## 3. Roles & flows

**Participant:** registers (name/email/password) → sees stand map (with a "walking" avatar, Google-
Maps-like) → opens a stand to read description/rules/points → after playing, shows their unique QR →
staff scans and credits → receives that activity's badge + points → checks profile (QR, points,
badges earned, badges missing, progress) and ranking.

**Admin:** logs in → designs the map → creates stands → creates one activity per stand → defines the
badge per activity → configures prizes per activity → creates/assigns staff and manages participant
accounts → can correct points (with an audit trail) → at close, reviews ranking and validates
winners by scanning their QR (identity + points + badges).

**Staff:** logs in → selects the stand/activity they operate → scans the participant's QR → system
shows basic participant data and whether they already did this activity → if not, assigns points per
the activity rule → system records points, badge, activity, datetime and responsible staff → at
close, can validate winners by QR.

## 4. Functional modules → sub-project mapping

| Module | Sub-project |
| --- | --- |
| Auth (3 roles, participant register) | SP1 (foundation) |
| Participant profile (QR, points, badges earned/missing, progress) | SP1 player UX |
| Stands & one-activity map | SP1 (read) / SP2 (authoring) |
| FAQ + Support, Terms & Conditions, Fan Page | **New** — player static pages (SP1 player UX) |
| Unique QR per user + show/scan | SP3 |
| Participation registration (select activity, scan, block double) | SP3 |
| Points (fixed or by position 1st/2nd/3rd) | SP2 (config) + SP3 (award) |
| Badges (one per activity; all → reward eligibility) | SP2 (define) + SP3 (award) |
| Public ranking | SP3 |
| Staff console (scan, assign/correct points, history, validate winners) | SP3 |
| Admin console (map, stands, activities, prizes, staff & participant accounts) | SP2 |
| Event close (top 3 + all-badges validation by QR) | SP3 |
| Point corrections with audit history | **New** — SP2/SP3 (admin & staff tools) |

## 5. Business rules

- **RN-01** unique QR per participant.
- **RN-02** points + badge once per activity; re-scan warns staff "already participated here".
- **RN-03** one activity per stand.
- **RN-04** each activity gives a badge for participating.
- **RN-05** points are fixed or by position, per activity.
- **RN-06** ranking ordered by accumulated points, descending.
- **RN-07** top 3 by points get the major prize.
- **RN-08** completing all badges unlocks an additional reward.
- **RN-09** staff can correct points, but every correction is logged in history.
- **RN-10** at close, the QR validates that the winner matches the registered account.

## 6. Data model (reconciled with the DB foundation)

- **profiles** (was `usuario`): id, name (display), email (unique), role
  (`participant|staff|admin`), `qr_token` (unique), created_at. *(password is in Supabase Auth, not
  here.)*
- **events**: id, name, slug, status. *(multi-event container.)*
- **stands**: id, event_id, name, description, map_x, map_y, icon, color.
- **activities**: id, stand_id (1:1 in practice), name, description, **score_type
  (`fixed|position`)**, points_fixed, points_first, points_second, points_third, badge fields.
- **badges**: one per activity — id, activity_id, name, description, icon.
- **participations** (the completion ledger): id, participation owner (player_id + event_id),
  activity_id, points, badge_id, datetime, staff_id, **position**, status. `unique(player, activity)`
  → enforces RN-02.
- **point_corrections** (**new**): id, participation_id, points_before, points_after, reason,
  staff_id, datetime — never delete the original; full traceability (RN-09).
- **ranking**: a computed view over participations — player, total_points, total_badges, position.
- **admin_allowlist**, **staff_assignments**: as in SP1/SP2.

## 7. Screens

Participant: Login/Register · Stand map (walking avatar, pending/done state) · Activity detail
(description, rules, possible points, **Show QR** button) · Profile (QR, points, badges earned/
missing, progress) · FAQ + Support · Terms & Conditions · Fan Page · Ranking.
Admin: Visual map editor · Stand+activity management · Staff creation · Account management · History/
corrections.
Staff: Panel (activity selector, QR scanner, point-assignment window) · History/corrections · Winner
validation.

## 8. Validations

- A participant may re-attempt a stand, but only the **first** participation grants points/badge.
- Warn staff if the participant already completed the activity.
- **Confirm before saving points**, especially position-based points.
- Log **every staff action** for internal audit.
- Allow point correction, **never delete original history** without traceability.
- Validate the scanned QR exists and belongs to an **active** user.
- Protect staff/admin views from participant access.

## 9. Out of scope (MVP)

From the client doc: native mobile app; mandatory PWA; Excel/CSV export; event access control;
accumulable per-event levels; "returning/previous winners" screen; complex indoor maps / real-time
geolocation.
From our prior decisions: storage buckets; speedrun/time-based ranking; offline scanning;
login-by-username.

## 10. Acceptance criteria

CA-01 register with name/email/password · CA-02 see unique QR from profile or activity · CA-03 staff
scan a QR and assign points · CA-04 block double points/badge per activity · CA-05 participant sees
points + badges earned/missing · CA-06 ranking visible to participants and staff · CA-07 staff/admin
correct points with logged history · CA-08 at close, validate top 3 and all-badges holders by QR ·
CA-09 admin create/delete/edit staff and participant accounts · CA-10 admin create/modify map,
stands, activities and prizes.

## 11. New work vs the original 3 sub-projects

These MVP items were **not** in the earlier SP1–SP3 designs and are now folded in:
- Points **by position** (1st/2nd/3rd) → SP2 config + SP3 award.
- **Point corrections with audit** (`point_corrections`) → SP2/SP3.
- **Event-close winner validation** by QR → SP3.
- **Admin account management** (create staff & participant accounts via service-role endpoint) → SP2.
- Player **static pages** (FAQ/Support, Terms, Fan Page) and **walking-avatar** map → SP1 player UX.
- Model changes: **one activity per stand**, explicit **staff role**, **email-as-identity** (no
  unique username).
