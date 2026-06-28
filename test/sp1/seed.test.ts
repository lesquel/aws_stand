/**
 * SP1 seed — default event bootstrap integration test.
 *
 * Validates that `supabase/seed.sql` (applied out-of-band by the orchestrator
 * via the Supabase MCP, service-role) lands a coherent "AWS Cloud Quest" event:
 * one active event, 5 stands, exactly one activity per stand (RN-03), one badge
 * per activity (RN-04), and the prize set from the legacy catalog.
 *
 * Written BEFORE the seed is applied, so it fails RED ("event not found" / 0
 * rows). After the seed runs it goes GREEN. Expected values are derived from
 * `src/domain/catalog.ts` so the test stays in parity with the seed's source.
 *
 * Uses `serviceClient()` (bypasses RLS) for stable, role-independent reads.
 */
import { describe, expect, it } from 'vitest';
import { serviceClient, type SupabaseClient } from '../helpers/supabase';
import { STANDS, PRIZES } from '../../src/domain/catalog';

const EVENT_SLUG = 'aws-cloud-quest';

/** Fetch the seeded event row by its stable slug, or null if absent. */
async function fetchEvent(
  service: SupabaseClient,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await service
    .from('events')
    .select('id, status')
    .eq('slug', EVENT_SLUG)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to query seeded event: ${error.message}`);
  }
  return data as { id: string; status: string } | null;
}

describe('SP1 seed — AWS Cloud Quest default event', () => {
  const service = serviceClient();

  it('creates the aws-cloud-quest event with status "active"', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();
    expect(event?.status).toBe('active');
  });

  it('seeds exactly 5 stands for the event', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();

    const { data, error } = await service
      .from('stands')
      .select('id, slug')
      .eq('event_id', event!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(5);

    const slugs = (data ?? []).map((s) => s.slug).sort();
    expect(slugs).toEqual([...STANDS.map((s) => s.id)].sort());
  });

  it('seeds exactly one activity per stand (RN-03)', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();

    const { data: stands, error: standsError } = await service
      .from('stands')
      .select('id')
      .eq('event_id', event!.id);
    expect(standsError).toBeNull();
    expect(stands).toHaveLength(5);

    for (const stand of stands ?? []) {
      const { data: acts, error } = await service
        .from('activities')
        .select('id')
        .eq('stand_id', stand.id);
      expect(error).toBeNull();
      expect(acts).toHaveLength(1);
    }
  });

  it('seeds exactly one badge per activity (RN-04)', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();

    const { data: stands } = await service
      .from('stands')
      .select('id')
      .eq('event_id', event!.id);
    const standIds = (stands ?? []).map((s) => s.id);

    const { data: acts, error: actsError } = await service
      .from('activities')
      .select('id')
      .in('stand_id', standIds);
    expect(actsError).toBeNull();
    expect(acts).toHaveLength(5);

    for (const act of acts ?? []) {
      const { data: badges, error } = await service
        .from('badges')
        .select('id')
        .eq('activity_id', act.id);
      expect(error).toBeNull();
      expect(badges).toHaveLength(1);
    }
  });

  it('seeds the prize set from the catalog', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();

    const { data, error } = await service
      .from('prizes')
      .select('slug')
      .eq('event_id', event!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(PRIZES.length);

    const slugs = (data ?? []).map((p) => p.slug).sort();
    expect(slugs).toEqual([...PRIZES.map((p) => p.id)].sort());
  });

  it('spot-checks the cloud stand map coordinates against the catalog', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();

    const { data, error } = await service
      .from('stands')
      .select('map_x, map_y')
      .eq('event_id', event!.id)
      .eq('slug', 'cloud')
      .single();
    expect(error).toBeNull();

    const cloud = STANDS.find((s) => s.id === 'cloud')!;
    expect(Number(data!.map_x)).toBe(cloud.map.x);
    expect(Number(data!.map_y)).toBe(cloud.map.y);
  });

  it('spot-checks the build stand activity points against the catalog', async () => {
    const event = await fetchEvent(service);
    expect(event).not.toBeNull();

    const { data: stand, error: standError } = await service
      .from('stands')
      .select('id')
      .eq('event_id', event!.id)
      .eq('slug', 'build')
      .single();
    expect(standError).toBeNull();

    const { data: act, error: actError } = await service
      .from('activities')
      .select('slug, points_fixed, score_type')
      .eq('stand_id', stand!.id)
      .single();
    expect(actError).toBeNull();

    const build = STANDS.find((s) => s.id === 'build')!;
    const firstActivity = build.activities[0];
    expect(act!.slug).toBe(firstActivity.id);
    expect(act!.points_fixed).toBe(firstActivity.tickets);
    expect(act!.score_type).toBe('fixed');
  });
});
