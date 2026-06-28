/* ============================================================
   Infrastructure · Supabase point-corrections repository

   The admin/staff console's surface for point corrections (RN-09, CA-07). All
   three operations go through SECURITY DEFINER RPCs authorized server-side as
   admin OR staff-of-that-event — never a client write grant:

   - `findParticipation`  → find_participation_for_correction: resolve a player's
     participation (id + current ticket balance) by their QR token within an event.
   - `correctPoints`      → correct_points: set a NEW ABSOLUTE ticket total and
     append an immutable audit row. Returns { before, after, delta }.
   - `listCorrections`    → list_point_corrections: read the append-only audit
     history (newest first), enriched with the corrector's username.

   Takes an authenticated client so the same code serves the browser (the admin's
   session) and the integration tests. Throws on the RPC error so the caller can
   branch on `code` (42501 unauthorized, P0002 not found, 22023 bad input).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** A participant resolved by QR token, ready for a correction. */
export interface ParticipationLookup {
  participationId: string;
  playerId: string;
  playerName: string;
  tickets: number;
  eventId: string;
  eventName: string;
}

/** The result of applying a correction. */
export interface CorrectionResult {
  ok: boolean;
  before: number;
  after: number;
  delta: number;
}

/** One audit-history entry for a participation. */
export interface CorrectionEntry {
  id: string;
  pointsBefore: number;
  pointsAfter: number;
  delta: number;
  reason: string;
  correctedBy: string;
  correctorName: string | null;
  createdAt: string;
}

/**
 * Resolve a participant by their QR token within an event. Throws on an
 * authorization failure (42501) or when the token / participation is unknown
 * (P0002) so the caller can show a precise message.
 */
export async function findParticipation(
  supabase: SupabaseClient,
  qrToken: string,
  eventId: string,
): Promise<ParticipationLookup> {
  const { data, error } = await supabase.rpc('find_participation_for_correction', {
    p_qr_token: qrToken,
    p_event_id: eventId,
  });
  if (error) throw error;

  const r = (data ?? {}) as {
    participation_id?: string;
    player_id?: string;
    player_name?: string;
    tickets?: number;
    event_id?: string;
    event_name?: string;
  };
  return {
    participationId: r.participation_id ?? '',
    playerId: r.player_id ?? '',
    playerName: r.player_name ?? '',
    tickets: r.tickets ?? 0,
    eventId: r.event_id ?? eventId,
    eventName: r.event_name ?? '',
  };
}

/**
 * Apply a correction: set the participation's ticket total to `newTickets`
 * (absolute, not a delta) with a mandatory `reason`. The server appends the
 * audit row. Throws on authorization failure (42501) or invalid input (22023).
 */
export async function correctPoints(
  supabase: SupabaseClient,
  participationId: string,
  newTickets: number,
  reason: string,
): Promise<CorrectionResult> {
  const { data, error } = await supabase.rpc('correct_points', {
    p_participation_id: participationId,
    p_new_tickets: newTickets,
    p_reason: reason,
  });
  if (error) throw error;

  const r = (data ?? {}) as { ok?: boolean; before?: number; after?: number; delta?: number };
  return {
    ok: r.ok ?? false,
    before: r.before ?? 0,
    after: r.after ?? 0,
    delta: r.delta ?? 0,
  };
}

interface CorrectionRow {
  id: string;
  points_before: number;
  points_after: number;
  delta: number;
  reason: string;
  corrected_by: string;
  corrector_name: string | null;
  created_at: string;
}

/**
 * Read the append-only correction history for a participation (newest first),
 * enriched with the corrector's username. Throws on an authorization failure.
 */
export async function listCorrections(
  supabase: SupabaseClient,
  participationId: string,
): Promise<CorrectionEntry[]> {
  const { data, error } = await supabase.rpc('list_point_corrections', {
    p_participation_id: participationId,
  });
  if (error) throw error;

  return ((data ?? []) as CorrectionRow[]).map((row) => ({
    id: row.id,
    pointsBefore: row.points_before,
    pointsAfter: row.points_after,
    delta: row.delta,
    reason: row.reason,
    correctedBy: row.corrected_by,
    correctorName: row.corrector_name,
    createdAt: row.created_at,
  }));
}
