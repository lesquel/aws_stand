/* ============================================================
   Domain · Progress rules
   A `progress` object is the player's mutable game state. These
   helpers are pure: they read a progress object (and the static
   catalog) and never mutate or touch any framework.
   ============================================================ */

import { standById } from './catalog';
import type { Progress, Stand } from './types';

/* the blank slate for a brand-new player */
export const emptyProgress = (): Progress => ({
  doneActivities: [], pieces: [], badges: [], claimed: [],
  visitedStands: [], tickets: 0, lastPiece: null,
});

/* Reconstruct the visited-stands set from completed activities against a
   catalog. `visitedStands` is not persisted in `participations` (no column);
   it is derived on load so the "visit N stands" badge keeps its progress.
   RN-03 guarantees one activity per stand, so each done activity maps to at
   most one stand. */
export function deriveVisitedStands(doneActivities: string[], stands: Stand[]): string[] {
  const activityToStand = new Map<string, string>();
  for (const stand of stands) {
    for (const activity of stand.activities) activityToStand.set(activity.id, stand.id);
  }
  const visited = new Set<string>();
  for (const activityId of doneActivities) {
    const standId = activityToStand.get(activityId);
    if (standId) visited.add(standId);
  }
  return [...visited];
}

/* a stand is "done" when every one of its activities is completed */
export function standDone(p: Progress, standId: string): boolean {
  const st = standById(standId); if (!st) return false;
  return st.activities.every(a => p.doneActivities.includes(a.id));
}

/* how many of a stand's activities are done, out of the total */
export function standProgress(p: Progress, standId: string): { done: number; total: number } {
  const st = standById(standId); if (!st) return { done: 0, total: 0 };
  const done = st.activities.filter(a => p.doneActivities.includes(a.id)).length;
  return { done, total: st.activities.length };
}
