/* ============================================================
   Infrastructure · Supabase prize repository
   Server-authoritative prize claiming. Claiming is NOT a client write to
   `participations`; it goes exclusively through the SECURITY DEFINER
   `claim_prize` RPC, which atomically validates affordability / stock /
   duplication, deducts tickets, records the claim, and decrements stock.
   The caller refreshes participation + catalog from the DB afterwards so the
   UI reflects the authoritative result.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Why a claim was refused — drives the user-facing toast. */
export type ClaimFailureReason =
  | 'insufficient'
  | 'out-of-stock'
  | 'already-claimed'
  | 'unknown';

export interface ClaimResult {
  ok: boolean;
  ticketsLeft: number;
  stockLeft: number;
}

/** Thrown when `claim_prize` rejects; `reason` is mapped from the RPC message. */
export class PrizeClaimError extends Error {
  readonly reason: ClaimFailureReason;
  constructor(reason: ClaimFailureReason, message: string) {
    super(message);
    this.name = 'PrizeClaimError';
    this.reason = reason;
  }
}

function mapReason(message: string): ClaimFailureReason {
  const m = message.toLowerCase();
  if (m.includes('insufficient')) return 'insufficient';
  if (m.includes('out of stock')) return 'out-of-stock';
  if (m.includes('already claimed')) return 'already-claimed';
  return 'unknown';
}

interface ClaimRow {
  ok: boolean;
  tickets_left: number;
  stock_left: number;
}

/**
 * Claim a prize for the calling player via the `claim_prize` RPC.
 * Resolves to the authoritative remaining tickets / stock on success, or throws
 * a `PrizeClaimError` carrying a mapped `reason` on any rejection.
 */
export async function claimPrize(
  supabase: SupabaseClient,
  eventId: string,
  prizeSlug: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_prize', {
    p_event_id: eventId,
    p_prize_slug: prizeSlug,
  });
  if (error) {
    throw new PrizeClaimError(mapReason(error.message), error.message);
  }
  // A SECURITY DEFINER function returning jsonb comes back as a single object;
  // tolerate an array form defensively.
  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow;
  return { ok: row.ok, ticketsLeft: row.tickets_left, stockLeft: row.stock_left };
}
