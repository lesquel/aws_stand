/* ============================================================
   Application · Use case — create a player
   The boundary where raw form input becomes a Player entity.
   ============================================================ */

import type { Player } from '../domain/types';

export function createPlayer(input: { name: string; baseId: string }): Player {
  return { name: input.name.trim(), baseId: input.baseId };
}
