/* ============================================================
   Application · Use case — create a player
   The boundary where raw form input becomes a Player entity.
   ============================================================ */

/**
 * @param {{ name: string, baseId: string }} input
 * @returns {{ name: string, baseId: string }} the new player
 */
export function createPlayer({ name, baseId }) {
  return { name: name.trim(), baseId };
}
