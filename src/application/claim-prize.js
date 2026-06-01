/* ============================================================
   Application · Use case — claim a prize
   Pure: validates affordability/stock/duplication and returns the
   next progress. Stock is shared event state, decremented by the
   caller (composition root) via the catalog, not here.
   ============================================================ */

/**
 * @param {object} progress current player progress
 * @param {object} prize    the prize entity being claimed
 * @returns {{ progress: object, ok: boolean }}
 *   ok is false when the prize can't be claimed (already claimed,
 *   not enough tickets, or out of stock); progress is then unchanged.
 */
export function claimPrize(progress, prize) {
  if (!prize) return { progress, ok: false };

  const blocked =
    progress.claimed.includes(prize.id) ||
    progress.tickets < prize.cost ||
    prize.stock <= 0;
  if (blocked) return { progress, ok: false };

  const np = JSON.parse(JSON.stringify(progress));
  np.tickets -= prize.cost;
  np.claimed.push(prize.id);

  return { progress: np, ok: true };
}
