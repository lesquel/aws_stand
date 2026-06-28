/**
 * SP2 Slice 3 — admin Stands CRUD integration test.
 *
 * Exercises the thin admin stands repository
 * (`supabase-admin-stands-repository.ts`) against the real remote Supabase
 * project, through the anon client exactly like the browser console does after
 * an admin logs in. A stand owns exactly one activity (RN-03) and that activity
 * owns exactly one badge (RN-04); creating a stand creates all three together.
 *
 *  - An admin can `createStand` under an event → the stand, its single activity
 *    and that activity's single badge all exist and are correctly linked.
 *  - `updateStand` patches stand coordinates/fields (slug stays locked).
 *  - The one-activity-per-stand and one-badge-per-activity DB constraints hold
 *    (a second direct insert is rejected).
 *  - A NON-admin player cannot create a stand (admin-write RLS rejects it).
 *  - `deleteStand` cascades to the activity and badge.
 *
 * Conventions mirror test/sp2/admin-events.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/supabase';
import { createEvent } from '../../src/infrastructure/supabase-admin-repository';
import {
  createStand,
  listStands,
  updateStand,
  deleteStand,
  getStand,
  StandValidationError,
} from '../../src/infrastructure/supabase-admin-stands-repository';

async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function standInput(slug: string) {
  return {
    name: 'Cloud Outpost',
    slug,
    description: 'Toss your workload to the cloud.',
    tag: 'AWS · Infrastructure',
    mapX: 16,
    mapY: 70,
    icon: 'ic_cloud',
    color: 'var(--orange)',
    accent: '#ff9900',
    pieceId: 'cap',
    sort: 0,
    activity: {
      name: 'Ring toss to the cloud',
      scoreType: 'fixed' as const,
      pointsFixed: 1,
      special: false,
    },
    badge: {
      name: 'Cloud Champion',
      description: 'Cleared the cloud stand.',
      icon: 'ic_cloud',
    },
  };
}

describe('SP2 — admin Stands CRUD', () => {
  const service: SupabaseClient = serviceClient();
  let createdUserIds: string[] = [];
  let seededEmails: string[] = [];
  let createdEventIds: string[] = [];

  afterEach(async () => {
    // Deleting the event cascades to its stands → activities → badges.
    for (const id of createdEventIds) {
      await service.from('events').delete().eq('id', id);
    }
    for (const id of createdUserIds) {
      try {
        await deleteTestUser(id, service);
      } catch {
        /* best-effort teardown */
      }
    }
    for (const email of seededEmails) {
      await service.from('admin_allowlist').delete().eq('email', email);
    }
    createdUserIds = [];
    seededEmails = [];
    createdEventIds = [];
  });

  async function makeAdminClient(): Promise<SupabaseClient> {
    const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const { error: allowError } = await service.from('admin_allowlist').insert({ email });
    if (allowError) throw new Error(`Failed to seed admin_allowlist: ${allowError.message}`);
    seededEmails.push(email);
    const admin = await createTestUser(service, email);
    createdUserIds.push(admin.id);
    return authedClient(admin.email, admin.password);
  }

  async function makeEvent(admin: SupabaseClient): Promise<string> {
    const event = await createEvent(admin, { name: 'Stands Host Event', slug: uniqueSlug('sp2-stand-evt') });
    createdEventIds.push(event.id);
    return event.id;
  }

  it('creates a stand together with its single activity and badge, all linked', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);

    const stand = await createStand(admin, eventId, standInput(uniqueSlug('cloud')));

    expect(stand.id).toBeTruthy();
    expect(stand.eventId).toBe(eventId);
    expect(stand.mapX).toBe(16);
    expect(stand.mapY).toBe(70);
    expect(stand.icon).toBe('ic_cloud');
    expect(stand.activity).not.toBeNull();
    expect(stand.activity?.name).toBe('Ring toss to the cloud');
    expect(stand.activity?.scoreType).toBe('fixed');
    expect(stand.activity?.pointsFixed).toBe(1);
    expect(stand.activity?.badge).not.toBeNull();
    expect(stand.activity?.badge?.name).toBe('Cloud Champion');

    // Verify the rows really exist and are linked through the service role.
    const { data: actRows } = await service
      .from('activities')
      .select('id, stand_id')
      .eq('stand_id', stand.id);
    expect(actRows ?? []).toHaveLength(1);
    const activityId = (actRows ?? [])[0]?.id as string;

    const { data: badgeRows } = await service
      .from('badges')
      .select('id, activity_id')
      .eq('activity_id', activityId);
    expect(badgeRows ?? []).toHaveLength(1);
  });

  it('supports a position-scored activity', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);

    const input = standInput(uniqueSlug('build'));
    const stand = await createStand(admin, eventId, {
      ...input,
      activity: {
        name: 'Defeat the boss',
        scoreType: 'position',
        pointsFirst: 5,
        pointsSecond: 3,
        pointsThird: 1,
        special: true,
      },
    });

    expect(stand.activity?.scoreType).toBe('position');
    expect(stand.activity?.pointsFirst).toBe(5);
    expect(stand.activity?.pointsSecond).toBe(3);
    expect(stand.activity?.pointsThird).toBe(1);
    expect(stand.activity?.special).toBe(true);
  });

  it('lists the stands of an event with their activity and badge', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const a = await createStand(admin, eventId, standInput(uniqueSlug('cloud')));
    const b = await createStand(admin, eventId, { ...standInput(uniqueSlug('ia')), sort: 1 });

    const stands = await listStands(admin, eventId);
    const ids = stands.map((s) => s.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    const loaded = stands.find((s) => s.id === a.id);
    expect(loaded?.activity?.badge?.name).toBe('Cloud Champion');
  });

  it('updates stand coordinates and fields while keeping the slug locked', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const slug = uniqueSlug('cloud');
    const stand = await createStand(admin, eventId, standInput(slug));

    const updated = await updateStand(admin, stand.id, {
      name: 'Cloud Outpost v2',
      mapX: 42,
      mapY: 58,
      activity: { name: 'Updated activity', scoreType: 'fixed', pointsFixed: 3 },
      badge: { name: 'Updated badge' },
    });

    expect(updated.slug).toBe(slug); // unchanged
    expect(updated.name).toBe('Cloud Outpost v2');
    expect(updated.mapX).toBe(42);
    expect(updated.mapY).toBe(58);
    expect(updated.activity?.name).toBe('Updated activity');
    expect(updated.activity?.pointsFixed).toBe(3);
    expect(updated.activity?.badge?.name).toBe('Updated badge');
  });

  it('rejects an empty name at the boundary before hitting the DB', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    await expect(
      createStand(admin, eventId, { ...standInput(uniqueSlug('cloud')), name: '   ' }),
    ).rejects.toBeInstanceOf(StandValidationError);
  });

  it('rejects out-of-range map coordinates at the boundary', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    await expect(
      createStand(admin, eventId, { ...standInput(uniqueSlug('cloud')), mapX: 140 }),
    ).rejects.toBeInstanceOf(StandValidationError);
  });

  it('rejects negative activity points at the boundary', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const input = standInput(uniqueSlug('cloud'));
    await expect(
      createStand(admin, eventId, {
        ...input,
        activity: { ...input.activity, pointsFixed: -3 },
      }),
    ).rejects.toBeInstanceOf(StandValidationError);
  });

  it('enforces one activity per stand (RN-03)', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const stand = await createStand(admin, eventId, standInput(uniqueSlug('cloud')));

    // A second activity for the same stand violates unique(stand_id).
    const { error } = await admin.from('activities').insert({
      stand_id: stand.id,
      slug: 'second',
      name: 'Second activity',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('enforces one badge per activity (RN-04)', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const stand = await createStand(admin, eventId, standInput(uniqueSlug('cloud')));
    const activityId = stand.activity!.id;

    const { error } = await admin.from('badges').insert({
      activity_id: activityId,
      name: 'Second badge',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('rejects a duplicate slug within the same event as a friendly error', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const slug = uniqueSlug('cloud');
    await createStand(admin, eventId, standInput(slug));

    await expect(createStand(admin, eventId, standInput(slug))).rejects.toThrow(
      /identificador|slug|existe/i,
    );
  });

  it('a non-admin player cannot create a stand (admin-write RLS rejects)', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const playerClient = await authedClient(player.email, player.password);

    await expect(
      createStand(playerClient, eventId, standInput(uniqueSlug('cloud'))),
    ).rejects.toThrow();

    // Nothing leaked through.
    const { data } = await service.from('stands').select('id').eq('event_id', eventId);
    expect(data ?? []).toHaveLength(0);
  });

  it('rolls back the whole create when the activity is invalid — no orphan stand (atomicity)', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);

    // Drive the RPC directly with a payload whose activity violates the
    // activities score_type CHECK constraint. The function inserts the stand
    // first, then the activity; the CHECK violation must roll back EVERYTHING.
    // (Going through createStand cannot reach this: boundary validation rejects
    // an invalid score_type before the RPC is ever called.)
    const payload = {
      event_id: eventId,
      stand: { slug: uniqueSlug('atomic'), name: 'Atomic Stand', map_x: 10, map_y: 10, sort: 0 },
      activity: { slug: 'bad', name: 'Bad activity', score_type: 'totally-invalid', points_fixed: 1 },
      badge: { name: 'Orphan badge' },
    };

    const { error } = await admin.rpc('admin_upsert_stand', { payload });
    // RED before the migration is applied: function-not-found (PGRST202), not the
    // CHECK violation. GREEN after apply: 23514 from the activities score_type CHECK.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23514');

    // The proof of atomicity: the stand insert was rolled back, so nothing leaked.
    const { data: standRows } = await service.from('stands').select('id').eq('event_id', eventId);
    expect(standRows ?? []).toHaveLength(0);
  });

  it('deleteStand cascades to the activity and badge', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const stand = await createStand(admin, eventId, standInput(uniqueSlug('cloud')));
    const activityId = stand.activity!.id;

    await deleteStand(admin, stand.id);

    expect(await getStand(admin, stand.id)).toBeNull();
    const { data: actRows } = await service.from('activities').select('id').eq('id', activityId);
    expect(actRows ?? []).toHaveLength(0);
    const { data: badgeRows } = await service
      .from('badges')
      .select('id')
      .eq('activity_id', activityId);
    expect(badgeRows ?? []).toHaveLength(0);
  });
});
