/* ============================================================
   Infrastructure · localStorage game repository
   Implements GameStoragePort. The only place that knows the
   storage key and the browser storage API. Guarded so an SSR or
   private-mode environment degrades gracefully instead of throwing.
   ============================================================ */

import type { GameState } from '../application/ports';

const STORE = 'cloudquest_v1';

export function load(): GameState | null {
  try {
    return (JSON.parse(localStorage.getItem(STORE) ?? 'null') as GameState) || null;
  } catch {
    return null;
  }
}

export function save(state: GameState): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode / quota) — ignore */
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}
