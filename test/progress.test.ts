import { describe, it, expect } from 'vitest';
import { standProgressOf, standDoneOf, emptyProgress } from '../src/domain/progress';
import type { Activity, Progress, Stand } from '../src/domain/types';

/* Build a Stand with an arbitrary activity list, mirroring a DB-loaded
   catalog stand (RN-03: one activity per stand). All other fields are
   irrelevant to the progress maths and use placeholder values. */
function standWith(activities: Activity[]): Stand {
  return {
    id: 'cloud', icon: 'ic_cloud', color: '#fff', accent: '#ff9900',
    name: { es: 'Nube', en: 'Cloud' }, tag: { es: '', en: '' }, blurb: { es: '', en: '' },
    piece: 'shield', map: { x: 0, y: 0 }, activities,
  };
}

const act = (id: string): Activity => ({ id, name: { es: id, en: id }, tickets: 1 });

function progressWithDone(ids: string[]): Progress {
  return { ...emptyProgress(), doneActivities: ids };
}

describe('standProgressOf', () => {
  it('derives the total from the provided stand, not the static catalog', () => {
    // DB catalog has exactly one activity per stand (RN-03) -> total must be 1
    const stand = standWith([act('cloud-a1')]);

    const progress = standProgressOf(stand, emptyProgress());

    expect(progress).toEqual({ done: 0, total: 1 });
  });

  it('counts only the stand activities the player has completed', () => {
    const stand = standWith([act('cloud-a1')]);

    const progress = standProgressOf(stand, progressWithDone(['cloud-a1', 'other-x']));

    expect(progress).toEqual({ done: 1, total: 1 });
  });
});

describe('standDoneOf', () => {
  it('is done when every stand activity is completed', () => {
    const stand = standWith([act('cloud-a1')]);

    expect(standDoneOf(stand, progressWithDone(['cloud-a1']))).toBe(true);
  });

  it('is not done while any stand activity is pending', () => {
    const stand = standWith([act('cloud-a1'), act('cloud-a2')]);

    expect(standDoneOf(stand, progressWithDone(['cloud-a1']))).toBe(false);
  });
});
