/**
 * SP3 — staff-scan repository integration test.
 *
 * Covers the testable core of the staff-scan station flow (the camera UI is
 * build-verified, not unit-tested): the `supabase-staff-repository` functions a
 * staffer's device calls through the authenticated anon client.
 *
 *  - `fetchMyAssignments` returns the caller's staff_assignments joined to the
 *    event + stand + that stand's single activity (RN-03), and returns nothing
 *    for a user who staffs no stand.
 *  - `approveCompletion(qrToken, activityId)` credits the scanned player on a
 *    fresh award (points returned, already_awarded:false) and is idempotent on a
 *    second scan (already_awarded:true, no double credit).
 *  - `approveCompletion` called by a user who is not staff of that stand surfaces
 *    the RPC's 42501 as a thrown error.
 *
 * Mirrors test/sp3/approve-completion.test.ts: service-role is used only for
 * setup/teardown; the browser path is reproduced by signing throwaway users into
 * anon clients. Run this file in isolation — the full suite trips auth rate limits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type SupabaseClient,
} from '../helpers/supabase';
import {
  fetchMyAssignments,
  approveCompletion,
} from '../../src/infrastructure/supabase-staff-repository';

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('SP3 staff-scan repository', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let standId: string;
  let activityId: string;
  let badgeId: string;

  let staffId: string;
  let staffClient: SupabaseClient;
  let playerId: string;
  let playerToken: string;
  let playerClient: SupabaseClient; // a plain participant, staffs nothing
  let playerBId: string;
  let playerBToken: string;

  async function authedFor(email: string, password: string): Promise<SupabaseClient> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  }

  beforeAll(async () => {
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-scan-evt'), name: 'SP3 Scan Repo Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    const { data: stand, error: standErr } = await service
      .from('stands')
      .insert({ event_id: eventId, slug: uniqueSlug('stand'), name: 'Cloud Outpost', map_x: 1, map_y: 2, accent: '#36c5f0', icon: 'cloud' })
      .select('id')
      .single();
    if (standErr || !stand) throw new Error(`stand insert failed: ${standErr?.message}`);
    standId = stand.id as string;

    const { data: activity, error: actErr } = await service
      .from('activities')
      .insert({ stand_id: standId, slug: uniqueSlug('act'), name: 'Ring toss', score_type: 'fixed', points_fixed: 5 })
      .select('id')
      .single();
    if (actErr || !activity) throw new Error(`activity insert failed: ${actErr?.message}`);
    activityId = activity.id as string;

    const { data: badge, error: badgeErr } = await service
      .from('badges')
      .insert({ activity_id: activityId, name: 'Cloud Champion' })
      .select('id')
      .single();
    if (badgeErr || !badge) throw new Error(`badge insert failed: ${badgeErr?.message}`);
    badgeId = badge.id as string;

    const staff = await createTestUser(service);
    staffId = staff.id;
    staffClient = await authedFor(staff.email, staff.password);
    const { error: asgErr } = await service
      .from('staff_assignments')
      .insert({ staff_id: staffId, event_id: eventId, stand_id: standId });
    if (asgErr) throw new Error(`staff_assignment insert failed: ${asgErr.message}`);

    const player = await createTestUser(service);
    playerId = player.id;
    playerClient = await authedFor(player.email, player.password);

    const playerB = await createTestUser(service);
    playerBId = playerB.id;

    const { data: profiles, error: profErr } = await service
      .from('profiles')
      .select('id, qr_token')
      .in('id', [playerId, playerBId]);
    if (profErr || !profiles) throw new Error(`profiles read failed: ${profErr?.message}`);
    playerToken = profiles.find((p) => p.id === playerId)!.qr_token as string;
    playerBToken = profiles.find((p) => p.id === playerBId)!.qr_token as string;
  });

  afterAll(async () => {
    for (const id of [playerId, playerBId, staffId]) {
      if (id) {
        try {
          await deleteTestUser(id, service);
        } catch {
          /* best-effort teardown */
        }
      }
    }
    if (eventId) await service.from('events').delete().eq('id', eventId);
  });

  it('fetchMyAssignments returns the caller’s assignment with stand + activity info', async () => {
    const assignments = await fetchMyAssignments(staffClient);
    const mine = assignments.find((a) => a.standId === standId);
    expect(mine).toBeDefined();
    expect(mine!.eventId).toBe(eventId);
    expect(mine!.eventName).toBe('SP3 Scan Repo Event');
    expect(mine!.standName).toBe('Cloud Outpost');
    expect(mine!.activity).not.toBeNull();
    expect(mine!.activity!.id).toBe(activityId);
    expect(mine!.activity!.name).toBe('Ring toss');
    expect(mine!.activity!.scoreType).toBe('fixed');
    expect(mine!.activity!.pointsFixed).toBe(5);
  });

  it('fetchMyAssignments returns nothing for a user who staffs no stand', async () => {
    const assignments = await fetchMyAssignments(playerClient);
    expect(assignments.some((a) => a.standId === standId)).toBe(false);
  });

  it('approveCompletion credits the player on a fresh scan and is idempotent on re-scan', async () => {
    const before = await ticketsOf(playerId);

    const first = await approveCompletion(staffClient, playerToken, activityId);
    expect(first.ok).toBe(true);
    expect(first.alreadyAwarded).toBe(false);
    expect(first.points).toBe(5);
    expect(first.playerName).toBeTruthy();
    expect(await ticketsOf(playerId)).toBe(before + 5);

    const second = await approveCompletion(staffClient, playerToken, activityId);
    expect(second.ok).toBe(true);
    expect(second.alreadyAwarded).toBe(true);
    expect(second.points).toBe(0);
    // No double credit.
    expect(await ticketsOf(playerId)).toBe(before + 5);
  });

  it('approveCompletion by a non-assigned user surfaces the RPC 42501', async () => {
    await expect(
      approveCompletion(playerClient, playerBToken, activityId),
    ).rejects.toMatchObject({ code: '42501' });
  });

  async function ticketsOf(id: string): Promise<number> {
    const { data } = await service
      .from('participations')
      .select('tickets')
      .eq('player_id', id)
      .eq('event_id', eventId)
      .maybeSingle();
    return data?.tickets ?? 0;
  }
});
