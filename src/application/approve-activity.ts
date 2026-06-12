/* ============================================================
   Application · Use case — approve an activity (staff code validation)
   Pure: validates the staff code then delegates to completeActivity.
   Returns { ok: false, reason: 'bad-code' } when the code is wrong,
   or { ok: true, ...completeActivity result } on success.
   ============================================================ */

import { standById } from '../domain/catalog';
import { completeActivity } from './complete-activity';
import type { Progress } from '../domain/types';

export type ApproveActivityResult =
  | { ok: false; reason: 'bad-code' }
  | { ok: true; progress: Progress; tickets: number; piece?: string | null; badges?: string[] };

export function approveActivity(
  progress: Progress,
  standId: string,
  actId: string,
  code: string
): ApproveActivityResult {
  const st = standById(standId);
  if (!st || code.trim() !== st.staffCode) {
    return { ok: false, reason: 'bad-code' };
  }

  const { progress: np, rewards } = completeActivity(progress, standId, actId);
  if (!rewards) {
    // Already completed — treat as success (idempotent)
    return { ok: true, progress: np, tickets: 0 };
  }

  return {
    ok: true,
    progress: np,
    tickets: rewards.tickets,
    piece: rewards.piece,
    badges: rewards.badges,
  };
}
