/* ============================================================
   Application · Use case — claim a prize
   Pure: validates affordability/stock/duplication and returns the
   next progress. Stock is shared event state, decremented by the
   caller (composition root) via the catalog, not here.
   ============================================================ */

import type { Progress, Prize } from '../domain/types';

export function claimPrize(
  progress: Progress,
  prize: Prize | undefined
): { progress: Progress; ok: boolean } {
  if (!prize) return { progress, ok: false };

  const blocked =
    progress.claimed.includes(prize.id) ||
    progress.tickets < prize.cost ||
    prize.stock <= 0;
  if (blocked) return { progress, ok: false };

  const np: Progress = JSON.parse(JSON.stringify(progress));
  np.tickets -= prize.cost;
  np.claimed.push(prize.id);

  return { progress: np, ok: true };
}
