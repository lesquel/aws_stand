/**
 * SP3 — approve_completion RPC + completions ledger integration test.
 *
 * Exercises the server-side scoring backbone the whole staff-scan flow stands
 * on, against the real remote Supabase project. A staff member (assigned to an
 * event + stand) scans a player's QR (profiles.qr_token) to register that the
 * player completed the stand's activity. All scoring is server-side and
 * authorized by `staff_assignments`; players cannot self-award.
 *
 * Security / behavior contract under test:
 *  - Staff of the stand approves -> a completion row exists, the participation
 *    cache is updated (tickets += points, badge + done_activities appended), and
 *    the RPC returns { ok, already_awarded: false, points, player_name }.
 *  - Re-scanning the same activity/player is idempotent (RN-02): already_awarded
 *    true, tickets NOT doubled, still exactly one completion row.
 *  - A caller who is NOT staff of that stand is rejected (42501); nothing awarded.
 *  - An unknown qr_token is rejected.
 *  - A position-scored activity awards points_first for p_position = 1; a
 *    missing/invalid position is rejected (RN-05).
 *  - A player cannot directly INSERT into completions (no client write grant).
 *  - A player can SELECT their own completions but not another player's (RLS).
 *
 * Conventions mirror test/sp1/participation.test.ts and test/sp2/admin-staff.test.ts:
 * service-role is used only for setup/teardown and cross-user assertions; the
 * authenticated browser path is reproduced by signing throwaway users into anon
 * clients. Run this file in isolation — the full suite trips auth rate limits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type SupabaseClient,
} from '../helpers/supabase';

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ActivityFixture {
  standId: string;
  activityId: string;
  badgeId: string | null;
}

describe('SP3 approve_completion — staff-scan scoring backbone', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let staffId: string;
  let staffClient: SupabaseClient;
  let playerAId: string;
  let playerAToken: string;
  let playerAClient: SupabaseClient;
  let playerBId: string;
  let playerBToken: string;
  let playerBClient: SupabaseClient;

  /**
   * Create a stand + its single activity (+ optional badge) under the shared
   * event, and bind the shared staff user to that stand. Each test gets its own
   * activity so awards stay independent (RN-03: one activity per stand).
   */
  async function makeActivity(opts: {
    scoreType?: 'fixed' | 'position';
    pointsFixed?: number;
    pointsFirst?: number;
    pointsSecond?: number;
    pointsThird?: number;
    withBadge?: boolean;
    assignStaff?: boolean;
  } = {}): Promise<ActivityFixture> {
    const {
      scoreType = 'fixed',
      pointsFixed = 5,
      pointsFirst = 10,
      pointsSecond = 6,
      pointsThird = 3,
      withBadge = true,
      assignStaff = true,
    } = opts;

    const { data: stand, error: standErr } = await service
      .from('stands')
      .insert({
        event_id: eventId,
        slug: uniqueSlug('stand'),
        name: 'Cloud Outpost',
        map_x: 10,
        map_y: 20,
      })
      .select('id')
      .single();
    if (standErr || !stand) throw new Error(`stand insert failed: ${standErr?.message}`);

    const { data: activity, error: actErr } = await service
      .from('activities')
      .insert({
        stand_id: stand.id,
        slug: uniqueSlug('act'),
        name: 'Ring toss',
        score_type: scoreType,
        points_fixed: pointsFixed,
        points_first: pointsFirst,
        points_second: pointsSecond,
        points_third: pointsThird,
      })
      .select('id')
      .single();
    if (actErr || !activity) throw new Error(`activity insert failed: ${actErr?.message}`);

    let badgeId: string | null = null;
    if (withBadge) {
      const { data: badge, error: badgeErr } = await service
        .from('badges')
        .insert({ activity_id: activity.id, name: 'Cloud Champion' })
        .select('id')
        .single();
      if (badgeErr || !badge) throw new Error(`badge insert failed: ${badgeErr?.message}`);
      badgeId = badge.id as string;
    }

    if (assignStaff) {
      const { error: asgErr } = await service.from('staff_assignments').insert({
        staff_id: staffId,
        event_id: eventId,
        stand_id: stand.id,
      });
      if (asgErr) throw new Error(`staff_assignment insert failed: ${asgErr.message}`);
    }

    return { standId: stand.id as string, activityId: activity.id as string, badgeId };
  }

  /** Read the player's current ticket balance for the shared event (0 if no participation). */
  async function ticketsOf(playerId: string): Promise<number> {
    const { data } = await service
      .from('participations')
      .select('tickets')
      .eq('player_id', playerId)
      .eq('event_id', eventId)
      .maybeSingle();
    return data?.tickets ?? 0;
  }

  async function authedFor(email: string, password: string): Promise<SupabaseClient> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  }

  beforeAll(async () => {
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-evt'), name: 'SP3 Scan Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    const staff = await createTestUser(service);
    staffId = staff.id;
    staffClient = await authedFor(staff.email, staff.password);

    const playerA = await createTestUser(service);
    playerAId = playerA.id;
    playerAClient = await authedFor(playerA.email, playerA.password);

    const playerB = await createTestUser(service);
    playerBId = playerB.id;
    playerBClient = await authedFor(playerB.email, playerB.password);

    const { data: profiles, error: profErr } = await service
      .from('profiles')
      .select('id, qr_token')
      .in('id', [playerAId, playerBId]);
    if (profErr || !profiles) throw new Error(`profiles read failed: ${profErr?.message}`);
    playerAToken = profiles.find((p) => p.id === playerAId)!.qr_token as string;
    playerBToken = profiles.find((p) => p.id === playerBId)!.qr_token as string;
  });

  afterAll(async () => {
    // Deleting players/staff cascades participations -> completions and
    // staff_assignments; deleting the event then cascades stands/activities/badges.
    for (const id of [playerAId, playerBId, staffId]) {
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

  it('credits a player when scanned by staff of the stand', async () => {
    const fx = await makeActivity({ pointsFixed: 5 });
    const before = await ticketsOf(playerAId);

    const { data, error } = await staffClient.rpc('approve_completion', {
      p_qr_token: playerAToken,
      p_activity_id: fx.activityId,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, already_awarded: false, points: 5 });
    expect(data.player_name).toBeTruthy();

    // The ledger row exists and is correctly attributed.
    const { data: completions } = await service
      .from('completions')
      .select('id, activity_id, stand_id, points, approved_by')
      .eq('activity_id', fx.activityId);
    expect(completions ?? []).toHaveLength(1);
    expect(completions![0].points).toBe(5);
    expect(completions![0].stand_id).toBe(fx.standId);
    expect(completions![0].approved_by).toBe(staffId);

    // The participation cache is updated: +points, badge + done_activities appended.
    const after = await ticketsOf(playerAId);
    expect(after).toBe(before + 5);

    const { data: part } = await service
      .from('participations')
      .select('badges, done_activities')
      .eq('player_id', playerAId)
      .eq('event_id', eventId)
      .single();
    expect(part!.done_activities).toContain(fx.activityId);
    expect(part!.badges).toContain(fx.badgeId);
  });

  it('is idempotent on a second scan of the same activity/player (RN-02)', async () => {
    const fx = await makeActivity({ pointsFixed: 7 });

    const first = await staffClient.rpc('approve_completion', {
      p_qr_token: playerAToken,
      p_activity_id: fx.activityId,
    });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ already_awarded: false, points: 7 });
    const afterFirst = await ticketsOf(playerAId);

    const second = await staffClient.rpc('approve_completion', {
      p_qr_token: playerAToken,
      p_activity_id: fx.activityId,
    });
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ ok: true, already_awarded: true, points: 0 });

    // Tickets are NOT doubled and there is still exactly one completion row.
    expect(await ticketsOf(playerAId)).toBe(afterFirst);
    const { data: rows } = await service
      .from('completions')
      .select('id')
      .eq('activity_id', fx.activityId);
    expect(rows ?? []).toHaveLength(1);
  });

  it('rejects a caller who is not staff of that stand and awards nothing', async () => {
    const fx = await makeActivity({ pointsFixed: 5 });

    // playerA is a plain participant, not assigned to this stand.
    const { error } = await playerAClient.rpc('approve_completion', {
      p_qr_token: playerBToken,
      p_activity_id: fx.activityId,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');

    const { data: rows } = await service
      .from('completions')
      .select('id')
      .eq('activity_id', fx.activityId);
    expect(rows ?? []).toHaveLength(0);
  });

  it('rejects an unknown qr_token', async () => {
    const fx = await makeActivity({ pointsFixed: 5 });

    const { error } = await staffClient.rpc('approve_completion', {
      p_qr_token: 'this-token-does-not-exist',
      p_activity_id: fx.activityId,
    });
    expect(error).not.toBeNull();

    const { data: rows } = await service
      .from('completions')
      .select('id')
      .eq('activity_id', fx.activityId);
    expect(rows ?? []).toHaveLength(0);
  });

  it('awards points_first for a position-scored activity and rejects a bad/missing position (RN-05)', async () => {
    const fx = await makeActivity({
      scoreType: 'position',
      pointsFirst: 10,
      pointsSecond: 6,
      pointsThird: 3,
    });
    const before = await ticketsOf(playerAId);

    // First place -> points_first.
    const win = await staffClient.rpc('approve_completion', {
      p_qr_token: playerAToken,
      p_activity_id: fx.activityId,
      p_position: 1,
    });
    expect(win.error).toBeNull();
    expect(win.data).toMatchObject({ already_awarded: false, points: 10 });
    expect(await ticketsOf(playerAId)).toBe(before + 10);

    // A position-scored activity without a position is rejected (use playerB so
    // the unique(participation, activity) guard doesn't mask the validation).
    const missing = await staffClient.rpc('approve_completion', {
      p_qr_token: playerBToken,
      p_activity_id: fx.activityId,
    });
    expect(missing.error).not.toBeNull();

    const bad = await staffClient.rpc('approve_completion', {
      p_qr_token: playerBToken,
      p_activity_id: fx.activityId,
      p_position: 9,
    });
    expect(bad.error).not.toBeNull();

    // playerB earned nothing from the rejected attempts.
    const { data: rows } = await service
      .from('completions')
      .select('id, participation_id')
      .eq('activity_id', fx.activityId);
    expect(rows ?? []).toHaveLength(1); // only playerA's winning row
  });

  it('does not let a player directly INSERT into completions', async () => {
    const fx = await makeActivity({ pointsFixed: 5 });

    // Give playerA a participation to reference, then attempt a raw insert.
    await playerAClient.rpc('join_event', { p_event_id: eventId });
    const { data: part } = await service
      .from('participations')
      .select('id')
      .eq('player_id', playerAId)
      .eq('event_id', eventId)
      .single();

    const { error } = await playerAClient.from('completions').insert({
      participation_id: part!.id,
      activity_id: fx.activityId,
      stand_id: fx.standId,
      points: 999,
      approved_by: playerAId,
    });
    expect(error).not.toBeNull();

    const { data: rows } = await service
      .from('completions')
      .select('id')
      .eq('activity_id', fx.activityId);
    expect(rows ?? []).toHaveLength(0);
  });

  it('lets a player read their own completions but not another player’s (RLS)', async () => {
    const fxA = await makeActivity({ pointsFixed: 4 });
    const fxB = await makeActivity({ pointsFixed: 4 });

    const awardA = await staffClient.rpc('approve_completion', {
      p_qr_token: playerAToken,
      p_activity_id: fxA.activityId,
    });
    expect(awardA.error).toBeNull();
    const awardB = await staffClient.rpc('approve_completion', {
      p_qr_token: playerBToken,
      p_activity_id: fxB.activityId,
    });
    expect(awardB.error).toBeNull();

    // Service-role lookup of B's completion id (to assert A cannot see it).
    const { data: bRows } = await service
      .from('completions')
      .select('id')
      .eq('activity_id', fxB.activityId);
    const bCompletionId = bRows![0].id as string;

    // playerA reads completions: every visible row is theirs; B's row is hidden.
    const { data: aVisible, error: aErr } = await playerAClient
      .from('completions')
      .select('id, participation_id');
    expect(aErr).toBeNull();
    const aParticipationIds = new Set((aVisible ?? []).map((r) => r.participation_id));

    const { data: aParts } = await service
      .from('participations')
      .select('id')
      .eq('player_id', playerAId);
    const aOwn = new Set((aParts ?? []).map((p) => p.id));

    for (const pid of aParticipationIds) {
      expect(aOwn.has(pid)).toBe(true);
    }
    expect((aVisible ?? []).some((r) => r.id === bCompletionId)).toBe(false);
    expect((aVisible ?? []).length).toBeGreaterThan(0);
  });
});
