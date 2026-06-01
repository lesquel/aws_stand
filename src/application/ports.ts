/* ============================================================
   Application · Ports
   Contracts the application depends on, implemented by the
   infrastructure layer (dependency inversion). The local-storage
   game repository in `infrastructure/` fulfills GameStoragePort.
   ============================================================ */

export type { GameState } from '../domain/types';

import type { GameState } from '../domain/types';

export interface GameStoragePort {
  load: () => GameState | null;
  save: (state: GameState) => void;
  clear: () => void;
}
