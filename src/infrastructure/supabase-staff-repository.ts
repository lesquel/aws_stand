/* ============================================================
   Infrastructure · Supabase staff-scan repository
   The staff device's read/write surface for the SP3 station flow:
   - `fetchMyAssignments` reads the caller's `staff_assignments` (RLS scopes the
     rows to `staff_id = auth.uid()`), joined to the event + stand + that stand's
     single activity (RN-03), so the console can list "which stand, which
     activity" without a second round-trip.
   - `approveCompletion` is the only write path: it calls the SECURITY DEFINER
     `approve_completion` RPC (authorized server-side by `staff_assignments`),
     which credits the scanned player idempotently and returns the toast payload.

   Both take an authenticated client so the same code serves the browser
   (game-provider's `supabase`) and the integration tests (a signed-in anon
   client). All scoring stays server-side; the client never trusts a points value.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ScoreType = 'fixed' | 'position';

/** The single activity (RN-03) a staffer credits at their assigned stand. */
export interface StaffActivity {
  id: string; // activity UUID — the value approve_completion expects
  name: string;
  scoreType: ScoreType;
  pointsFixed: number;
  pointsFirst: number | null;
  pointsSecond: number | null;
  pointsThird: number | null;
}

/** One staff binding: a stand at an event, plus its activity, for the console. */
export interface StaffAssignment {
  id: string; // assignment id
  eventId: string;
  eventName: string;
  standId: string;
  standSlug: string;
  standName: string;
  standAccent: string | null;
  standIcon: string | null;
  activity: StaffActivity | null;
}

/** Parsed `approve_completion` result, ready for the staff toast. */
export interface ApproveResult {
  ok: boolean;
  alreadyAwarded: boolean;
  points: number;
  playerName: string;
}

// ── PostgREST row shapes (embeds may arrive as object or single-element array) ──

interface ActivityRow {
  id: string;
  name: string;
  score_type: ScoreType;
  points_fixed: number;
  points_first: number | null;
  points_second: number | null;
  points_third: number | null;
}
interface EventRow {
  name: string;
}
interface StandRow {
  id: string;
  slug: string;
  name: string;
  accent: string | null;
  icon: string | null;
  activities: ActivityRow | ActivityRow[] | null;
}
interface AssignmentRow {
  id: string;
  event_id: string;
  stand_id: string;
  events: EventRow | EventRow[] | null;
  stands: StandRow | StandRow[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const ASSIGNMENT_SELECT =
  'id, event_id, stand_id, ' +
  'events(name), ' +
  'stands(id, slug, name, accent, icon, ' +
  'activities(id, name, score_type, points_fixed, points_first, points_second, points_third))';

function mapActivity(row: ActivityRow): StaffActivity {
  return {
    id: row.id,
    name: row.name,
    scoreType: row.score_type,
    pointsFixed: row.points_fixed,
    pointsFirst: row.points_first,
    pointsSecond: row.points_second,
    pointsThird: row.points_third,
  };
}

function mapAssignment(row: AssignmentRow): StaffAssignment {
  const event = firstOf(row.events);
  const stand = firstOf(row.stands);
  const activity = stand ? firstOf(stand.activities) : null;
  return {
    id: row.id,
    eventId: row.event_id,
    eventName: event?.name ?? '',
    standId: stand?.id ?? row.stand_id,
    standSlug: stand?.slug ?? '',
    standName: stand?.name ?? '',
    standAccent: stand?.accent ?? null,
    standIcon: stand?.icon ?? null,
    activity: activity ? mapActivity(activity) : null,
  };
}

/**
 * The caller's staff assignments (RLS-scoped to the authenticated user), each
 * with its event + stand + the stand's single activity. Returns an empty array
 * for a user who staffs no stand. Throws on an unexpected query error.
 */
export async function fetchMyAssignments(
  supabase: SupabaseClient,
): Promise<StaffAssignment[]> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select(ASSIGNMENT_SELECT)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as AssignmentRow[]).map(mapAssignment);
}

/**
 * Credit the scanned player for the activity via the server-side
 * `approve_completion` RPC. `position` is required only for position-scored
 * activities (1/2/3). The RPC is idempotent: a second scan of the same
 * activity/player returns `alreadyAwarded: true` with `points: 0`. Throws on
 * authorization failure (42501) or an unknown QR token so the caller can branch.
 */
export async function approveCompletion(
  supabase: SupabaseClient,
  qrToken: string,
  activityId: string,
  position?: number,
): Promise<ApproveResult> {
  const params: { p_qr_token: string; p_activity_id: string; p_position?: number } = {
    p_qr_token: qrToken,
    p_activity_id: activityId,
  };
  if (position != null) params.p_position = position;

  const { data, error } = await supabase.rpc('approve_completion', params);
  if (error) throw error;

  const r = (data ?? {}) as {
    ok?: boolean;
    already_awarded?: boolean;
    points?: number;
    player_name?: string;
  };
  return {
    ok: r.ok ?? false,
    alreadyAwarded: r.already_awarded ?? false,
    points: r.points ?? 0,
    playerName: r.player_name ?? '',
  };
}
