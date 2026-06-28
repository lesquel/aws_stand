/**
 * SP3 capstone — integrity close-out: revoke client participation writes and
 * extend approve_completion to also award the stand's collectible piece.
 *
 * Runs against the real remote Supabase project. Two contracts under test:
 *
 *  1. SP1 hole CLOSED — after migration 0008 the broad client UPDATE grant on
 *     `participations` (and its RLS update policy) is gone. The owning player can
 *     no longer self-mutate their ledger: a direct
 *     `update participations set tickets = 9999` is REJECTED (permission denied
 *     / no row updated). Participations are now mutated ONLY by SECURITY DEFINER
 *     RPCs (join_event / approve_completion / correct_points / claim_prize).
 *
 *  2. approve_completion now also awards the stand's piece — on a fresh award it
 *     appends the stand's `piece_id` to `participations.pieces` (deduped), so the
 *     avatar album stays server-side now that the client self-approve path is
 *     gone. Pieces are earned ONLY via a staff scan.
 *
 * Conventions mirror test/sp3/approve-completion.test.ts: service-role is used
 * only for setup/teardown; the authenticated browser path is reproduced by
 * signing throwaway users into anon clients. Run this file in isolation — the
 * full suite trips auth rate limits.
 *
 * Assertions that depend on migration 0008 being applied: the revoke rejection
 * and the piece award. They are RED until the orchestrator applies 0008.
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

describe('SP3 revoke-harden — close the SP1 self-mutation hole + piece award', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let staffId: string;
  let staffClient: SupabaseClient;
  let playerId: string;
  let playerToken: string;
  let playerClient: SupabaseClient;

  async function authedFor(email: string, password: string): Promise<SupabaseClient> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  }

  /**
   * Create a stand carrying a collectible `piece_id` plus its single activity,
   * and bind the shared staff user to that stand.
   */
  async function makeStandWithPiece(pieceId: string): Promise<{ standId: string; activityId: string }> {
    const { data: stand, error: standErr } = await service
      .from('stands')
      .insert({
        event_id: eventId,
        slug: uniqueSlug('stand'),
        name: 'Cloud Outpost',
        map_x: 10,
        map_y: 20,
        piece_id: pieceId,
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
        score_type: 'fixed',
        points_fixed: 5,
      })
      .select('id')
      .single();
    if (actErr || !activity) throw new Error(`activity insert failed: ${actErr?.message}`);

    const { error: asgErr } = await service.from('staff_assignments').insert({
      staff_id: staffId,
      event_id: eventId,
      stand_id: stand.id,
    });
    if (asgErr) throw new Error(`staff_assignment insert failed: ${asgErr.message}`);

    return { standId: stand.id as string, activityId: activity.id as string };
  }

  async function piecesOf(): Promise<string[]> {
    const { data } = await service
      .from('participations')
      .select('pieces')
      .eq('player_id', playerId)
      .eq('event_id', eventId)
      .maybeSingle();
    return (data?.pieces as string[] | undefined) ?? [];
  }

  beforeAll(async () => {
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-rh-evt'), name: 'SP3 Revoke-Harden Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    const staff = await createTestUser(service);
    staffId = staff.id;
    staffClient = await authedFor(staff.email, staff.password);

    const player = await createTestUser(service);
    playerId = player.id;
    playerClient = await authedFor(player.email, player.password);

    const { data: profile, error: profErr } = await service
      .from('profiles')
      .select('id, qr_token')
      .eq('id', playerId)
      .single();
    if (profErr || !profile) throw new Error(`profile read failed: ${profErr?.message}`);
    playerToken = profile.qr_token as string;
  });

  afterAll(async () => {
    for (const id of [playerId, staffId]) {
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

  it('rejects a direct client participation write — the SP1 tickets=9999 hole is closed', async () => {
    // Seed a clean ledger via the SECURITY DEFINER join RPC (the only client join path).
    const { error: joinErr } = await playerClient.rpc('join_event', { p_event_id: eventId });
    expect(joinErr).toBeNull();

    const before = await service
      .from('participations')
      .select('tickets')
      .eq('player_id', playerId)
      .eq('event_id', eventId)
      .single();
    expect(before.data!.tickets).toBe(0);

    // The owning player attempts to self-award. After 0008 the UPDATE grant and
    // the update RLS policy are gone, so this must NOT mutate the row. Supabase
    // surfaces this either as a permission error or as an empty (zero-row) update.
    const { error } = await playerClient
      .from('participations')
      .update({ tickets: 9999 })
      .eq('player_id', playerId)
      .eq('event_id', eventId);

    if (!error) {
      // No error means RLS/grant silently matched zero rows — assert nothing changed.
      const { data: visible } = await playerClient
        .from('participations')
        .update({ tickets: 9999 })
        .eq('player_id', playerId)
        .eq('event_id', eventId)
        .select('id');
      expect(visible ?? []).toHaveLength(0);
    } else {
      expect(error).not.toBeNull();
    }

    // Authoritative check via service role: tickets are still 0.
    const after = await service
      .from('participations')
      .select('tickets')
      .eq('player_id', playerId)
      .eq('event_id', eventId)
      .single();
    expect(after.data!.tickets).toBe(0);
  });

  it('awards the stand piece on a staff scan (approve_completion appends piece_id)', async () => {
    const fx = await makeStandWithPiece('cap');

    const { data, error } = await staffClient.rpc('approve_completion', {
      p_qr_token: playerToken,
      p_activity_id: fx.activityId,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, already_awarded: false, points: 5 });

    // The avatar album is updated server-side: the stand's piece is now owned.
    expect(await piecesOf()).toContain('cap');
  });

  it('does not duplicate the piece on a repeat scan (deduped, idempotent)', async () => {
    const fx = await makeStandWithPiece('visor');

    const first = await staffClient.rpc('approve_completion', {
      p_qr_token: playerToken,
      p_activity_id: fx.activityId,
    });
    expect(first.error).toBeNull();
    expect(await piecesOf()).toContain('visor');

    // Re-scan: already awarded, no second piece entry.
    const second = await staffClient.rpc('approve_completion', {
      p_qr_token: playerToken,
      p_activity_id: fx.activityId,
    });
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ already_awarded: true });

    const pieces = await piecesOf();
    expect(pieces.filter((p) => p === 'visor')).toHaveLength(1);
  });

  it('awards no piece when the stand has no piece_id (null-safe)', async () => {
    // A stand without piece_id: the award must not push null/empty into pieces.
    const { data: stand } = await service
      .from('stands')
      .insert({ event_id: eventId, slug: uniqueSlug('stand'), name: 'No Piece', map_x: 1, map_y: 1 })
      .select('id')
      .single();
    const { data: activity } = await service
      .from('activities')
      .insert({ stand_id: stand!.id, slug: uniqueSlug('act'), name: 'NP', score_type: 'fixed', points_fixed: 2 })
      .select('id')
      .single();
    await service.from('staff_assignments').insert({ staff_id: staffId, event_id: eventId, stand_id: stand!.id });

    const before = await piecesOf();
    const { error } = await staffClient.rpc('approve_completion', {
      p_qr_token: playerToken,
      p_activity_id: activity!.id,
    });
    expect(error).toBeNull();

    const after = await piecesOf();
    // No null entry; the set of pieces is unchanged by a piece-less stand.
    expect(after).toEqual(before);
    expect(after).not.toContain(null);
  });
});
