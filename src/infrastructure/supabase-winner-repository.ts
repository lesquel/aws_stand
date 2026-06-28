/* ============================================================
   Infrastructure · Supabase winner-validation repository

   The staff/admin console's surface for event-close winner validation
   (CA-08, RN-07/08/10). The single operation goes through the SECURITY DEFINER
   `validate_winner` RPC, authorized server-side as admin OR staff-of-that-event
   — never a client read of another player's participation:

   - `validateWinner(qrToken, eventId)` → validate_winner: resolve the scanned
     player (RN-10) and return their event-close eligibility card: points, rank,
     badges X/Y, top-3 and all-badges flags.

   Takes an authenticated client so the same code serves the browser (the staff /
   admin session) and the integration tests. Throws on the RPC error so the
   caller can branch on `code` (42501 unauthorized, P0002 unknown QR / not a
   participant). Scoring is read-only; nothing is mutated.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The identity + eligibility card a staffer/admin sees after a winner scan. */
export interface WinnerValidation {
  ok: boolean;
  playerId: string;
  playerName: string;
  tickets: number;
  badgesCount: number;
  totalBadges: number;
  hasAllBadges: boolean;
  rank: number;
  isTop3: boolean;
}

interface WinnerRow {
  ok?: boolean;
  player_id?: string;
  player_name?: string;
  tickets?: number;
  badges_count?: number;
  total_badges?: number;
  has_all_badges?: boolean;
  rank?: number;
  is_top3?: boolean;
}

/**
 * Validate a scanned player for the event-close prizes. Throws on an
 * authorization failure (42501) or when the QR token is unknown / the player is
 * not participating in the event (P0002) so the caller can show a precise
 * message.
 */
export async function validateWinner(
  supabase: SupabaseClient,
  qrToken: string,
  eventId: string,
): Promise<WinnerValidation> {
  const { data, error } = await supabase.rpc('validate_winner', {
    p_qr_token: qrToken,
    p_event_id: eventId,
  });
  if (error) throw error;

  const r = (data ?? {}) as WinnerRow;
  return {
    ok: r.ok ?? false,
    playerId: r.player_id ?? '',
    playerName: r.player_name ?? '',
    tickets: r.tickets ?? 0,
    badgesCount: r.badges_count ?? 0,
    totalBadges: r.total_badges ?? 0,
    hasAllBadges: r.has_all_badges ?? false,
    rank: r.rank ?? 0,
    isTop3: r.is_top3 ?? false,
  };
}
