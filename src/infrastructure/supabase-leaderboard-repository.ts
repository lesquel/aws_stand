/* ============================================================
   Infrastructure · Supabase leaderboard read repository
   Reads the per-event public ranking via the `event_leaderboard`
   SECURITY DEFINER RPC. `participations` RLS is owner-only, so the
   ranking can only be assembled server-side; the RPC returns just the
   public fields (username + tickets + badges_count), never PII.
   Consumed by the leaderboard screen for the player's current event.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  tickets: number;
  badgesCount: number;
}

interface LeaderboardRow {
  rank: number;
  player_id: string;
  username: string;
  tickets: number;
  badges_count: number;
}

/** Ranked standings for an active event, ordered by tickets desc (time tiebreak). */
export async function fetchLeaderboard(
  supabase: SupabaseClient,
  eventId: string,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('event_leaderboard', { p_event_id: eventId });
  if (error) throw error;
  return ((data ?? []) as LeaderboardRow[]).map((row) => ({
    rank: row.rank,
    playerId: row.player_id,
    username: row.username,
    tickets: row.tickets,
    badgesCount: row.badges_count,
  }));
}
