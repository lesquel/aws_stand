/* ============================================================
   Infrastructure · Supabase participation repository
   The per-event progress ledger. A `participations` row is the source of truth
   for one player's game state in one event (SP1 moved progress out of
   `profiles` into per-event participations).

   Join path: a client may NOT insert participations directly (insert is revoked
   in the schema). Joining goes exclusively through the SECURITY DEFINER
   `join_event` RPC, which initializes a clean ledger and is idempotent on
   (player_id, event_id). Gameplay writes update only the granted columns
   (tickets / pieces / badges / claimed / done_activities), scoped to the
   caller's own row by RLS.

   Progress ⇄ participations mapping (src/domain/types.ts → DB columns):
     tickets        ⇄ tickets
     pieces         ⇄ pieces
     badges         ⇄ badges
     claimed        ⇄ claimed
     doneActivities ⇄ done_activities
     lastPiece      → NOT stored. It is a transient per-completion signal that
                      drives the piece-unlock animation; restoring it would
                      replay the animation on every reload, so load yields null.
     visitedStands  → NOT stored (no column, and the client grant covers only
                      the five gameplay columns). It is re-derived from
                      doneActivities against the active-event catalog by the
                      provider (RN-03: exactly one activity per stand), which
                      keeps the DB columns clean for SP2/SP3 reads.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PieceId, Progress } from '../domain/types';
import { emptyProgress } from '../domain/progress';

const ROW_COLUMNS =
  'id,player_id,event_id,tickets,pieces,badges,claimed,done_activities,joined_at';

interface ParticipationRow {
  id: string;
  player_id: string;
  event_id: string;
  tickets: number | null;
  pieces: unknown;
  badges: unknown;
  claimed: unknown;
  done_activities: unknown;
  joined_at: string;
}

export interface Participation {
  id: string;
  eventId: string;
  progress: Progress;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Map a participations row to a domain Progress (see mapping note above). */
export function participationRowToProgress(row: ParticipationRow): Progress {
  return {
    ...emptyProgress(),
    tickets: typeof row.tickets === 'number' ? row.tickets : 0,
    pieces: asStringArray(row.pieces) as PieceId[],
    badges: asStringArray(row.badges),
    claimed: asStringArray(row.claimed),
    doneActivities: asStringArray(row.done_activities),
    // visitedStands derived by the provider; lastPiece is transient → null.
    visitedStands: [],
    lastPiece: null,
  };
}

function rowToParticipation(row: ParticipationRow): Participation {
  return { id: row.id, eventId: row.event_id, progress: participationRowToProgress(row) };
}

/**
 * Join (or resolve) the caller's participation in an event via the
 * `join_event` RPC. Idempotent: returns the existing row if already joined.
 * The RPC raises if the event is not active.
 */
export async function joinEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<Participation> {
  const { data, error } = await supabase.rpc('join_event', { p_event_id: eventId });
  if (error) throw error;
  if (!data) throw new Error('join_event returned no participation row');
  // A SECURITY DEFINER function returning a composite type comes back as a
  // single object; tolerate an array form defensively.
  const row = (Array.isArray(data) ? data[0] : data) as ParticipationRow;
  return rowToParticipation(row);
}

/** Fetch the caller's own participation for an event, or null if not joined. */
export async function fetchParticipation(
  supabase: SupabaseClient,
  eventId: string,
): Promise<Participation | null> {
  const { data, error } = await supabase
    .from('participations')
    .select(ROW_COLUMNS)
    .eq('event_id', eventId)
    .maybeSingle<ParticipationRow>();
  if (error) throw error;
  if (!data) return null;
  return rowToParticipation(data);
}

/**
 * Persist the gameplay columns of the caller's participation. The update is
 * scoped to (player_id, event_id); `userId` is passed explicitly so callers can
 * validate it against the live session (write-behind discipline), and RLS
 * independently restricts the row to auth.uid().
 */
export async function saveParticipation(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  progress: Progress,
): Promise<void> {
  const { error } = await supabase
    .from('participations')
    .update({
      tickets: progress.tickets,
      pieces: progress.pieces,
      badges: progress.badges,
      claimed: progress.claimed,
      done_activities: progress.doneActivities,
    })
    .eq('player_id', userId)
    .eq('event_id', eventId);
  if (error) throw error;
}
