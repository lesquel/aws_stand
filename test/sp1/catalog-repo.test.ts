/**
 * SP1 Slice 3 — catalog read repository integration test.
 *
 * Validates `loadCatalog()` (src/infrastructure/supabase-catalog-repository.ts):
 * it reads stands (+ their single activity) and prizes for the ACTIVE event,
 * mapping DB rows to the domain `Stand`/`Activity`/`Prize` shapes.
 *
 * RLS reality (verified against the live DB): the catalog tables grant SELECT
 * only to the `authenticated` role — a bare anon client reads zero rows. The
 * real app loads the catalog AFTER login, so this test signs a throwaway user
 * into an anon client to reproduce the authenticated browser read path.
 *
 * The offline-fallback case (`loadCatalog(null)`) needs no DB and asserts the
 * static catalog is returned unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type SupabaseClient,
} from '../helpers/supabase';
import { loadCatalog } from '../../src/infrastructure/supabase-catalog-repository';
import { STANDS, PRIZES } from '../../src/domain/catalog';
import type { Localized } from '../../src/domain/types';

const ACTIVE_SLUGS = ['build', 'cloud', 'crew', 'ia', 'sec']; // sorted
const INACTIVE_EVENT_SLUG = 'catalog-repo-inactive-test';
const INACTIVE_STAND_SLUG = 'zzz-inactive-stand';

function isLocalized(value: unknown): value is Localized {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Localized).es === 'string' &&
    typeof (value as Localized).en === 'string'
  );
}

describe('SP1 catalog read repository — loadCatalog()', () => {
  let authed: SupabaseClient;
  let testUserId: string;
  let draftEventId: string;

  beforeAll(async () => {
    // Seed an inactive (draft) event with a stand to prove it is NOT returned.
    const service = serviceClient();
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: INACTIVE_EVENT_SLUG, name: 'Inactive Test Event', status: 'draft' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`Failed to seed draft event: ${evErr?.message}`);
    draftEventId = ev.id as string;
    const { error: stErr } = await service.from('stands').insert({
      event_id: draftEventId,
      slug: INACTIVE_STAND_SLUG,
      name: 'Inactive Stand',
      map_x: 1,
      map_y: 1,
    });
    if (stErr) throw new Error(`Failed to seed draft stand: ${stErr.message}`);

    // Sign a throwaway user into an anon client → authenticated read path.
    const user = await createTestUser(service);
    testUserId = user.id;
    authed = anonClient();
    const { error: signInErr } = await authed.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (signInErr) throw new Error(`Failed to sign in test user: ${signInErr.message}`);
  });

  afterAll(async () => {
    const service = serviceClient();
    if (draftEventId) await service.from('events').delete().eq('id', draftEventId);
    if (testUserId) await deleteTestUser(testUserId, service);
  });

  it('returns the 5 active-event stands with the expected slugs', async () => {
    const { stands } = await loadCatalog(authed);
    expect(stands).toHaveLength(5);
    expect(stands.map((s) => s.id).sort()).toEqual(ACTIVE_SLUGS);
  });

  it('maps exactly one activity per stand with the correct points (RN-03)', async () => {
    const { stands } = await loadCatalog(authed);
    for (const stand of stands) {
      expect(stand.activities).toHaveLength(1);
      expect(typeof stand.activities[0].tickets).toBe('number');
    }
    const cloud = stands.find((s) => s.id === 'cloud')!;
    const build = stands.find((s) => s.id === 'build')!;
    expect(cloud.activities[0].tickets).toBe(1);
    expect(build.activities[0].tickets).toBe(2);
    expect(cloud.activities[0].id).toBe('c1');
    expect(build.activities[0].id).toBe('b1');
  });

  it('produces domain-shaped stands (Localized fields, numeric map coords)', async () => {
    const { stands } = await loadCatalog(authed);
    const cloud = stands.find((s) => s.id === 'cloud')!;
    expect(isLocalized(cloud.name)).toBe(true);
    expect(isLocalized(cloud.tag)).toBe(true);
    expect(isLocalized(cloud.blurb)).toBe(true);
    expect(isLocalized(cloud.activities[0].name)).toBe(true);
    expect(typeof cloud.map.x).toBe('number');
    expect(typeof cloud.map.y).toBe('number');
    expect(cloud.map).toEqual({ x: 16, y: 70 });
    expect(cloud.piece).toBe('cap');
  });

  it('returns the 5 active-event prizes shaped as domain prizes', async () => {
    const { prizes } = await loadCatalog(authed);
    expect(prizes).toHaveLength(PRIZES.length);
    expect(prizes.map((p) => p.id).sort()).toEqual([...PRIZES.map((p) => p.id)].sort());
    const grand = prizes.find((p) => p.id === 'grand')!;
    expect(isLocalized(grand.name)).toBe(true);
    expect(grand.raffle).toBe(true);
    expect(typeof grand.cost).toBe('number');
    expect(typeof grand.stock).toBe('number');
    expect(typeof grand.sprite).toBe('string');
    expect(grand.sprite.length).toBeGreaterThan(0);
  });

  it('does not return content from an inactive (draft) event', async () => {
    const { stands } = await loadCatalog(authed);
    expect(stands.some((s) => s.id === INACTIVE_STAND_SLUG)).toBe(false);
  });

  it('falls back to the static catalog when no client is configured (offline)', async () => {
    const { stands, prizes } = await loadCatalog(null);
    expect(stands).toBe(STANDS);
    expect(prizes).toBe(PRIZES);
  });
});
