/* ============================================================
   Application · Ports
   Contracts the application depends on, implemented by the
   infrastructure layer (dependency inversion). The local-storage
   game repository in `infrastructure/` fulfills GameStoragePort.
   ============================================================ */

/**
 * @typedef {object} GameState
 * @property {object|null} player
 * @property {object} progress
 */

/**
 * @typedef {object} GameStoragePort
 * @property {() => GameState|null} load   Read persisted game state, or null.
 * @property {(state: GameState) => void} save   Persist the game state.
 * @property {() => void} clear   Remove all persisted game state.
 */

export {};
