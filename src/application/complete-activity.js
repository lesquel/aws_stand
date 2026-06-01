/* ============================================================
   Application · Use case — complete an activity
   Pure: takes the current progress and returns the next progress
   plus the rewards earned. No state, no toasts, no confetti — the
   presentation layer decides how to celebrate the rewards.
   ============================================================ */

import { standById } from '../domain/catalog';
import { standDone } from '../domain/progress';
import { newlyEarnedBadges } from '../domain/badges';

/**
 * @returns {{ progress: object, rewards: null | { tickets: number, piece: string|null, badges: string[] } }}
 *   rewards is null when the activity was already completed (no-op).
 */
export function completeActivity(progress, standId, actId) {
  if (progress.doneActivities.includes(actId)) {
    return { progress, rewards: null };
  }

  const st = standById(standId);
  const act = st.activities.find(a => a.id === actId);

  const np = JSON.parse(JSON.stringify(progress));
  np.doneActivities.push(actId);
  np.tickets += act.tickets;
  if (!np.visitedStands.includes(standId)) np.visitedStands.push(standId);

  // a piece unlocks the moment its stand is fully cleared
  let unlockedPiece = null;
  if (standDone(np, standId) && !np.pieces.includes(st.piece)) {
    np.pieces.push(st.piece);
    np.lastPiece = st.piece;
    unlockedPiece = st.piece;
  } else {
    np.lastPiece = null;
  }

  // recompute achievements against the new progress
  const earned = newlyEarnedBadges(np);
  np.badges.push(...earned);

  return {
    progress: np,
    rewards: { tickets: act.tickets, piece: unlockedPiece, badges: earned },
  };
}
