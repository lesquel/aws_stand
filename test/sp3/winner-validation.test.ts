/**
 * SP3 — validate_winner RPC integration test (event-close winner validation).
 *
 * Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
 *   CA-08: at close, staff can validate top 3 and all-badges participants via QR.
 *   RN-07: top 3 by points get the major prize.
 *   RN-08: all badges -> extra reward.
 *   RN-10: the QR validates the winner matches the registered account.
 *
 * Why an RPC and not a direct query: `participations` RLS is owner-only, so a
 * staffer cannot read another player's row. The eligibility card is exposed
 * through a SECURITY DEFINER function authorized server-side (admin OR
 * staff-of-event), returning only identity + eligibility fields — never PII.
 *
 * Conventions mirror test/sp3/corrections.test.ts: service-role is used only for
 * setup/teardown; the authenticated browser path is reproduced by signing
 * throwaway users into anon clients. Run this file in ISOLATION — the full suite
 * trips auth rate limits.
 *
 * RED until 0006_validate_winner.sql is applied: the RPC does not exist yet, so
 * every `rpc('validate_winner', ...)` call resolves with a PostgREST error.
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
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

interface WinnerCard {
  ok: boolean;
  player_id: string;
  player_name: string;
  tickets: number;
  badges_count: number;
  total_badges: number;
  has_all_badges: boolean;
  rank: number;
  is_top3: boolean;
}

describe('SP3 validate_winner — event-close winner validation', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let otherEventId: string;

  // Badge ids for the event's three stands -> total_badges = 3.
  const badgeIds: string[] = [];

  // Players (active event). joined_at controls the time tiebreak.
  let playerTopId: string; // rank 1, all 3 badges  -> top3 + has_all
  let playerTopToken: string;
  let playerPartialId: string; // rank 2, 1 badge   -> top3, not has_all
  let playerPartialToken: string;
  let playerLowId: string; // rank 4              -> not top3
  let playerLowToken: string;
  // (a filler at rank 3 keeps the low player out of the top 3)
  let playerMidId: string;

  let adminEmail: string;
  let adminId: string;
  let adminClient: SupabaseClient;

  let staffId: string;
  let staffClient: SupabaseClient;

  let outsiderId: string; // staff of the OTHER event only
  let outsiderClient: SupabaseClient;

  async function authedFor(email: string, password: string): Promise<SupabaseClient> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  }

  async function setUsername(playerId: string, username: string): Promise<void> {
    const { error } = await service.from('profiles').update({ username }).eq('id', playerId);
    if (error) throw new Error(`username update failed: ${error.message}`);
  }

  async function tokenOf(playerId: string): Promise<string> {
    const { data, error } = await service
      .from('profiles')
      .select('qr_token')
      .eq('id', playerId)
      .single();
    if (error || !data) throw new Error(`qr_token read failed: ${error?.message}`);
    return data.qr_token as string;
  }

  async function seedParticipation(opts: {
    playerId: string;
    eventId: string;
    tickets: number;
    badges?: string[];
    joinedAt: string;
  }): Promise<void> {
    const { error } = await service.from('participations').insert({
      player_id: opts.playerId,
      event_id: opts.eventId,
      tickets: opts.tickets,
      badges: opts.badges ?? [],
      joined_at: opts.joinedAt,
    });
    if (error) throw new Error(`participation insert failed: ${error.message}`);
  }

  beforeAll(async () => {
    // Active event with three stands, each with one activity + one badge.
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-win'), name: 'SP3 Winner Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    for (let i = 0; i < 3; i += 1) {
      const { data: stand, error: standErr } = await service
        .from('stands')
        .insert({ event_id: eventId, slug: uniqueSlug(`stand${i}`), name: `Stand ${i}`, map_x: i, map_y: i })
        .select('id')
        .single();
      if (standErr || !stand) throw new Error(`stand insert failed: ${standErr?.message}`);

      const { data: activity, error: actErr } = await service
        .from('activities')
        .insert({ stand_id: stand.id, slug: uniqueSlug(`act${i}`), name: `Activity ${i}`, score_type: 'fixed', points_fixed: 5 })
        .select('id')
        .single();
      if (actErr || !activity) throw new Error(`activity insert failed: ${actErr?.message}`);

      const { data: badge, error: badgeErr } = await service
        .from('badges')
        .insert({ activity_id: activity.id, name: `Badge ${i}` })
        .select('id')
        .single();
      if (badgeErr || !badge) throw new Error(`badge insert failed: ${badgeErr?.message}`);
      badgeIds.push(badge.id as string);
    }

    // A second event (the outsider staffs only this one).
    const { data: ev2, error: ev2Err } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-win-other'), name: 'SP3 Other Event', status: 'active' })
      .select('id')
      .single();
    if (ev2Err || !ev2) throw new Error(`other event insert failed: ${ev2Err?.message}`);
    otherEventId = ev2.id as string;
    const { data: stand2, error: stand2Err } = await service
      .from('stands')
      .insert({ event_id: otherEventId, slug: uniqueSlug('ostand'), name: 'Other Stand', map_x: 9, map_y: 9 })
      .select('id')
      .single();
    if (stand2Err || !stand2) throw new Error(`other stand insert failed: ${stand2Err?.message}`);

    // Players.
    const top = await createTestUser(service);
    playerTopId = top.id;
    const partial = await createTestUser(service);
    playerPartialId = partial.id;
    const mid = await createTestUser(service);
    playerMidId = mid.id;
    const low = await createTestUser(service);
    playerLowId = low.id;

    await setUsername(playerTopId, 'AceWinner');
    await setUsername(playerPartialId, 'ByteRunner');
    await setUsername(playerMidId, 'CirroMid');
    await setUsername(playerLowId, 'DeltaLow');

    playerTopToken = await tokenOf(playerTopId);
    playerPartialToken = await tokenOf(playerPartialId);
    playerLowToken = await tokenOf(playerLowId);

    // Rank order by tickets desc: top(50) > partial(40) > mid(30) > low(10).
    await seedParticipation({ playerId: playerTopId, eventId, tickets: 50, badges: badgeIds, joinedAt: '2024-01-01T10:00:00.000Z' });
    await seedParticipation({ playerId: playerPartialId, eventId, tickets: 40, badges: [badgeIds[0]], joinedAt: '2024-01-01T10:01:00.000Z' });
    await seedParticipation({ playerId: playerMidId, eventId, tickets: 30, badges: [badgeIds[0], badgeIds[1]], joinedAt: '2024-01-01T10:02:00.000Z' });
    await seedParticipation({ playerId: playerLowId, eventId, tickets: 10, badges: [], joinedAt: '2024-01-01T10:03:00.000Z' });

    // Admin (allowlisted email -> handle_new_user assigns role 'admin').
    adminEmail = uniqueEmail('admin');
    const { error: allowErr } = await service.from('admin_allowlist').insert({ email: adminEmail });
    if (allowErr) throw new Error(`admin_allowlist seed failed: ${allowErr.message}`);
    const admin = await createTestUser(service, adminEmail);
    adminId = admin.id;
    adminClient = await authedFor(admin.email, admin.password);

    // Staff of the winner event (assigned to one of its stands).
    const staff = await createTestUser(service);
    staffId = staff.id;
    staffClient = await authedFor(staff.email, staff.password);
    const eventStand = await firstStandOf(eventId);
    const { error: asgErr } = await service
      .from('staff_assignments')
      .insert({ staff_id: staffId, event_id: eventId, stand_id: eventStand.standId });
    if (asgErr) throw new Error(`staff_assignment insert failed: ${asgErr.message}`);

    // Outsider: staff of the OTHER event only.
    const outsider = await createTestUser(service);
    outsiderId = outsider.id;
    outsiderClient = await authedFor(outsider.email, outsider.password);
    const { error: asg2Err } = await service
      .from('staff_assignments')
      .insert({ staff_id: outsiderId, event_id: otherEventId, stand_id: stand2.id });
    if (asg2Err) throw new Error(`outsider staff_assignment insert failed: ${asg2Err.message}`);
  });

  /** Resolve a stand id of the event so the staff assignment satisfies the FK. */
  async function firstStandOf(eId: string): Promise<{ standId: string }> {
    const { data, error } = await service
      .from('stands')
      .select('id')
      .eq('event_id', eId)
      .limit(1)
      .single();
    if (error || !data) throw new Error(`stand lookup failed: ${error?.message}`);
    return { standId: data.id as string };
  }

  afterAll(async () => {
    for (const id of [playerTopId, playerPartialId, playerMidId, playerLowId, staffId, outsiderId, adminId]) {
      if (id) {
        try {
          await deleteTestUser(id, service);
        } catch {
          /* best-effort teardown */
        }
      }
    }
    if (eventId) await service.from('events').delete().eq('id', eventId);
    if (otherEventId) await service.from('events').delete().eq('id', otherEventId);
    if (adminEmail) await service.from('admin_allowlist').delete().eq('email', adminEmail);
  });

  it('staff-of-event validates the top scorer: rank 1, is_top3, correct tickets/badges', async () => {
    const { data, error } = await staffClient.rpc('validate_winner', {
      p_qr_token: playerTopToken,
      p_event_id: eventId,
    });
    expect(error).toBeNull();
    const card = data as WinnerCard;
    expect(card.ok).toBe(true);
    expect(card.player_id).toBe(playerTopId);
    expect(card.player_name).toBe('AceWinner');
    expect(card.tickets).toBe(50);
    expect(card.rank).toBe(1);
    expect(card.is_top3).toBe(true);
    expect(card.badges_count).toBe(3);
  });

  it('admin validates a participant too (admin path authorized)', async () => {
    const { data, error } = await adminClient.rpc('validate_winner', {
      p_qr_token: playerPartialToken,
      p_event_id: eventId,
    });
    expect(error).toBeNull();
    const card = data as WinnerCard;
    expect(card.player_id).toBe(playerPartialId);
    expect(card.rank).toBe(2);
    expect(card.is_top3).toBe(true);
  });

  it('flags a participant with ALL event badges (RN-08)', async () => {
    const { data } = await staffClient.rpc('validate_winner', {
      p_qr_token: playerTopToken,
      p_event_id: eventId,
    });
    const card = data as WinnerCard;
    expect(card.has_all_badges).toBe(true);
    expect(card.badges_count).toBe(card.total_badges);
  });

  it('does NOT flag a partial-badge participant', async () => {
    const { data } = await staffClient.rpc('validate_winner', {
      p_qr_token: playerPartialToken,
      p_event_id: eventId,
    });
    const card = data as WinnerCard;
    expect(card.has_all_badges).toBe(false);
    expect(card.badges_count).toBeLessThan(card.total_badges);
  });

  it('total_badges reflects the event badge count (3)', async () => {
    const { data } = await staffClient.rpc('validate_winner', {
      p_qr_token: playerLowToken,
      p_event_id: eventId,
    });
    const card = data as WinnerCard;
    expect(card.total_badges).toBe(3);
  });

  it('marks a low scorer as not top 3 (rank 4)', async () => {
    const { data } = await staffClient.rpc('validate_winner', {
      p_qr_token: playerLowToken,
      p_event_id: eventId,
    });
    const card = data as WinnerCard;
    expect(card.rank).toBe(4);
    expect(card.is_top3).toBe(false);
    expect(card.has_all_badges).toBe(false);
  });

  it('rejects a caller who is neither admin nor staff of the event (42501)', async () => {
    const result = await outsiderClient.rpc('validate_winner', {
      p_qr_token: playerTopToken,
      p_event_id: eventId,
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('42501');
  });

  it('errors on an unknown QR token (P0002)', async () => {
    const result = await staffClient.rpc('validate_winner', {
      p_qr_token: 'definitely-not-a-real-token',
      p_event_id: eventId,
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('P0002');
  });

  it('errors when the player is not participating in the event (P0002)', async () => {
    // playerTop participates in `eventId`, not in `otherEventId`.
    const result = await adminClient.rpc('validate_winner', {
      p_qr_token: playerTopToken,
      p_event_id: otherEventId,
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('P0002');
  });
});
