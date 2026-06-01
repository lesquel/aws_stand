/* ============================================================
   Infrastructure · localStorage game repository
   Implements GameStoragePort. The only place that knows the
   storage key and the browser storage API. Guarded so an SSR or
   private-mode environment degrades gracefully instead of throwing.
   ============================================================ */

const STORE = 'cloudquest_v1';

/** @returns {import('../application/ports').GameState|null} */
export function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || null;
  } catch {
    return null;
  }
}

/** @param {import('../application/ports').GameState} state */
export function save(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode / quota) — ignore */
  }
}

export function clear() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}
