/**
 * SP3 — event_leaderboard RPC integration test (per-event public ranking).
 *
 * Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
 *   RN-06: ranking ordered by accumulated points (tickets) desc.
 *   CA-06: the ranking is visible to participants AND staff.
 *   Time is the tiebreak — earliest join wins.
 *
 * Why an RPC and not a direct query: `participations` RLS is owner-only, so a
 * player cannot read other players' rows. The public ranking is therefore
 * exposed through a SECURITY DEFINER function that returns only the public
 * ranking fields (username + tickets + badges_count) — never email or PII.
 *
 * Conventions mirror test/sp3/approve-completion.test.ts: service-role is used
 * only for setup/teardown and cross-user assertions; the authenticated browser
 * path is reproduced by signing a throwaway user into an anon client. Run this
 * file in isolation — the full suite trips auth rate limits.
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

interface LeaderboardRow {
  rank: number;
  player_id: string;
  username: string;
  tickets: number;
  badges_count: number;
}

describe('SP3 event_leaderboard — per-event public ranking', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let draftEventId: string;

  // Three ranked participants in the active event.
  let playerAId: string; // 30 tickets, joined first, 2 badges  -> rank 1
  let playerBId: string; // 20 tickets, joined second           -> rank 2
  let playerCId: string; // 20 tickets, joined third (tie)      -> rank 3

  // A signed-in authenticated user who is NOT a participant of the event:
  // proves the ranking is public via the RPC, unlike the owner-only
  // participations RLS.
  let outsiderId: string;
  let outsiderClient: SupabaseClient;

  async function authedFor(email: string, password: string): Promise<SupabaseClient> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  }

  /** Set a distinct, assertable username on a service-created profile. */
  async function setUsername(playerId: string, username: string): Promise<void> {
    const { error } = await service
      .from('profiles')
      .update({ username })
      .eq('id', playerId);
    if (error) throw new Error(`username update failed: ${error.message}`);
  }

  /** Insert a participation with controlled tickets / badges / joined_at. */
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
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-lb'), name: 'SP3 Leaderboard Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    const { data: draft, error: draftErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-lb-draft'), name: 'SP3 Draft Event', status: 'draft' })
      .select('id')
      .single();
    if (draftErr || !draft) throw new Error(`draft event insert failed: ${draftErr?.message}`);
    draftEventId = draft.id as string;

    const playerA = await createTestUser(service);
    playerAId = playerA.id;
    const playerB = await createTestUser(service);
    playerBId = playerB.id;
    const playerC = await createTestUser(service);
    playerCId = playerC.id;

    await setUsername(playerAId, 'AceCloud');
    await setUsername(playerBId, 'ByteBuddy');
    await setUsername(playerCId, 'CirroCadet');

    // Active event: A leads on tickets; B and C tie on tickets, B joined first.
    await seedParticipation({
      playerId: playerAId,
      eventId,
      tickets: 30,
      badges: ['badge-x', 'badge-y'],
      joinedAt: '2024-01-01T10:00:00.000Z',
    });
    await seedParticipation({
      playerId: playerBId,
      eventId,
      tickets: 20,
      joinedAt: '2024-01-01T10:01:00.000Z',
    });
    await seedParticipation({
      playerId: playerCId,
      eventId,
      tickets: 20,
      joinedAt: '2024-01-01T10:02:00.000Z',
    });

    // Draft event has a participant too — the RPC must still return empty.
    await seedParticipation({
      playerId: playerAId,
      eventId: draftEventId,
      tickets: 99,
      joinedAt: '2024-01-01T09:00:00.000Z',
    });

    const outsider = await createTestUser(service);
    outsiderId = outsider.id;
    outsiderClient = await authedFor(outsider.email, outsider.password);
  });

  afterAll(async () => {
    for (const id of [playerAId, playerBId, playerCId, outsiderId]) {
      if (id) {
        try {
          await deleteTestUser(id, service);
        } catch {
          /* best-effort teardown */
        }
      }
    }
    if (eventId) await service.from('events').delete().eq('id', eventId);
    if (draftEventId) await service.from('events').delete().eq('id', draftEventId);
  });

  it('returns the three participants ranked by tickets desc with 1-based rank', async () => {
    const { data, error } = await outsiderClient.rpc('event_leaderboard', {
      p_event_id: eventId,
    });
    expect(error).toBeNull();

    const rows = (data ?? []) as LeaderboardRow[];
    expect(rows).toHaveLength(3);

    expect(rows[0]).toMatchObject({ rank: 1, player_id: playerAId, username: 'AceCloud', tickets: 30 });
    expect(rows[1]).toMatchObject({ rank: 2, player_id: playerBId, tickets: 20 });
    expect(rows[2]).toMatchObject({ rank: 3, player_id: playerCId, tickets: 20 });
  });

  it('breaks ticket ties by earliest joined_at (RN-06)', async () => {
    const { data } = await outsiderClient.rpc('event_leaderboard', { p_event_id: eventId });
    const rows = (data ?? []) as LeaderboardRow[];

    // B and C are tied at 20 tickets; B joined one minute earlier, so B ranks above C.
    const b = rows.find((r) => r.player_id === playerBId)!;
    const c = rows.find((r) => r.player_id === playerCId)!;
    expect(b.rank).toBe(2);
    expect(c.rank).toBe(3);
    expect(b.rank).toBeLessThan(c.rank);
  });

  it('reports badges_count as the jsonb array length', async () => {
    const { data } = await outsiderClient.rpc('event_leaderboard', { p_event_id: eventId });
    const rows = (data ?? []) as LeaderboardRow[];

    expect(rows.find((r) => r.player_id === playerAId)!.badges_count).toBe(2);
    expect(rows.find((r) => r.player_id === playerBId)!.badges_count).toBe(0);
    expect(rows.find((r) => r.player_id === playerCId)!.badges_count).toBe(0);
  });

  it('exposes only public ranking fields — no email or other PII', async () => {
    const { data } = await outsiderClient.rpc('event_leaderboard', { p_event_id: eventId });
    const rows = (data ?? []) as LeaderboardRow[];

    const keys = Object.keys(rows[0]).sort();
    expect(keys).toEqual(['badges_count', 'player_id', 'rank', 'tickets', 'username']);
    expect(keys).not.toContain('email');
  });

  it('returns empty for a draft event without leaking its existence', async () => {
    const { data, error } = await outsiderClient.rpc('event_leaderboard', {
      p_event_id: draftEventId,
    });
    expect(error).toBeNull();
    expect((data ?? []) as LeaderboardRow[]).toHaveLength(0);
  });

  it('lets an authenticated non-participant read the ranking (public via RPC)', async () => {
    // The outsider is not a participant of the event; the owner-only
    // participations RLS would hide every row from a direct query, yet the
    // SECURITY DEFINER RPC returns the full public ranking.
    const direct = await outsiderClient
      .from('participations')
      .select('id')
      .eq('event_id', eventId);
    expect(direct.data ?? []).toHaveLength(0); // RLS hides others' participations

    const { data, error } = await outsiderClient.rpc('event_leaderboard', {
      p_event_id: eventId,
    });
    expect(error).toBeNull();
    expect((data ?? []) as LeaderboardRow[]).toHaveLength(3);
  });

  it('rejects a truly unauthenticated caller (no session, anon key only) — closes the anon-grant leak', async () => {
    // event_leaderboard has no internal auth.uid() check — it is filtered
    // only by the event's status. Before migration 0010 revoked EXECUTE from
    // `anon` (both the explicit per-function grant AND the PostgreSQL PUBLIC
    // default grant, which anon inherits), any caller holding just the
    // public anon key — no login, no session — could read every
    // participant's username/tickets/badges_count for any active event.
    const trulyAnon = anonClient(); // never signs in
    const { data, error } = await trulyAnon.rpc('event_leaderboard', {
      p_event_id: eventId,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
