/* ============================================================
   Application · Use case — create a player
   The boundary where raw form input becomes a Player entity.
   ============================================================ */

import type { Player, Role } from '../domain/types';

export function createPlayer(input: { name: string; baseId: string; role?: Role; standId?: string }): Player {
  const player: Player = { name: input.name.trim(), baseId: input.baseId };
  if (input.role) player.role = input.role;
  if (input.standId) player.standId = input.standId;
  return player;
}
