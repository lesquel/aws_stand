/* ============================================================
   Domain · Badges (achievements)
   Each badge owns a pure `check(progress)` predicate — an event
   invariant. `newlyEarnedBadges` is the rule that recomputes which
   badges a progress object has just unlocked.
   ============================================================ */

import { T } from './i18n';
import { PIECE_ORDER, STANDS } from './catalog';
import { standDone } from './progress';

export const BADGES = [
  { id: 'explorer', icon: 'ic_compass', name: T('Explorador', 'Explorer'),
    desc: T('Visita 3 stands', 'Visit 3 stands'),
    check: p => p.visitedStands.length >= 3 },
  { id: 'network', icon: 'ic_medal', name: T('Networking Pro', 'Networking Pro'),
    desc: T('Completa 6 actividades', 'Complete 6 activities'),
    check: p => p.doneActivities.length >= 6 },
  { id: 'challenger', icon: 'ic_bolt', name: T('Cloud Challenger', 'Cloud Challenger'),
    desc: T('Termina el Puesto Nube', 'Clear Cloud Outpost'),
    check: p => standDone(p, 'cloud') },
  { id: 'collector', icon: 'ic_star', name: T('Coleccionista', 'Collector'),
    desc: T('Arma el avatar completo', 'Complete your avatar'),
    check: p => PIECE_ORDER.every(id => p.pieces.includes(id)) },
  { id: 'full', icon: 'ic_trophy', name: T('Full Event', 'Full Event'),
    desc: T('Completa los 5 stands', 'Clear all 5 stands'),
    check: p => STANDS.every(s => standDone(p, s.id)) },
];

export const badgeById = id => BADGES.find(b => b.id === id);

/* Badge ids that `p` now satisfies but has not been awarded yet. */
export function newlyEarnedBadges(p) {
  return BADGES.filter(b => b.check(p) && !p.badges.includes(b.id)).map(b => b.id);
}
