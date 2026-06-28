/**
 * SP3 — claim_prize RPC: server-authoritative prize claiming + integrity hardening.
 *
 * Moves prize claiming off the client (was: pure claimPrize + cosmetic
 * decrementStock + write-behind) into a single SECURITY DEFINER RPC so a player
 * can no longer self-award by writing participations directly. The RPC atomically:
 *   - resolves the caller's participation in the event (auth.uid()),
 *   - resolves the prize by (event_id, slug),
 *   - rejects when already claimed / out of stock / not enough tickets,
 *   - else deducts tickets, appends the prize to `claimed`, and decrements the
 *     prize `stock` (fixing the old client-only stock no-op).
 *
 * Conventions mirror test/sp3/corrections.test.ts: the service-role client is used
 * only for setup / teardown and cross-user assertions; the authenticated browser
 * path is reproduced by signing a throwaway user into an anon client. Run this
 * file in isolation — the full suite trips auth rate limits.
 *
 * RED until migration 0007_claim_prize.sql is applied (function missing).
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

async function authedFor(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe('SP3 claim_prize — server-authoritative prize claiming', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let playerId: string;
  let playerEmail: string;
  let playerPassword: string;
  let playerClient: SupabaseClient;
  let participationId: string;

  // A distinct prize slug per test so stock / claimed state never bleeds across cases.
  let prizeSlug: string;

  /** Reset the shared player's participation to a known ticket balance + claimed list. */
  async function seedParticipation(tickets: number, claimed: string[] = []): Promise<void> {
    const { data, error } = await service
      .from('participations')
      .upsert(
        { player_id: playerId, event_id: eventId, tickets, claimed },
        { onConflict: 'player_id,event_id' },
      )
      .select('id')
      .single();
    if (error || !data) throw new Error(`participation seed failed: ${error?.message}`);
    participationId = data.id as string;
  }

  /** Insert a fresh prize for this event and return its slug. */
  async function seedPrize(cost: number, stock: number): Promise<string> {
    const slug = uniqueSlug('prize');
    const { error } = await service
      .from('prizes')
      .insert({ event_id: eventId, slug, name: 'Test Prize', cost, stock });
    if (error) throw new Error(`prize seed failed: ${error.message}`);
    return slug;
  }

  async function ticketsOf(): Promise<number> {
    const { data } = await service
      .from('participations')
      .select('tickets')
      .eq('id', participationId)
      .single();
    return data?.tickets ?? 0;
  }

  async function claimedOf(): Promise<string[]> {
    const { data } = await service
      .from('participations')
      .select('claimed')
      .eq('id', participationId)
      .single();
    return (data?.claimed as string[]) ?? [];
  }

  async function stockOf(slug: string): Promise<number> {
    const { data } = await service
      .from('prizes')
      .select('stock')
      .eq('event_id', eventId)
      .eq('slug', slug)
      .single();
    return data?.stock ?? 0;
  }

  beforeAll(async () => {
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-claim-evt'), name: 'SP3 Claim Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    const player = await createTestUser(service);
    playerId = player.id;
    playerEmail = player.email;
    playerPassword = player.password;
    playerClient = await authedFor(playerEmail, playerPassword);
  });

  afterAll(async () => {
    if (playerId) {
      try {
        await deleteTestUser(playerId, service);
      } catch {
        /* best-effort teardown */
      }
    }
    if (eventId) await service.from('events').delete().eq('id', eventId);
  });

  it('claims an affordable, in-stock prize: deducts tickets, records claim, decrements stock', async () => {
    await seedParticipation(10);
    prizeSlug = await seedPrize(3, 5);

    const { data, error } = await playerClient.rpc('claim_prize', {
      p_event_id: eventId,
      p_prize_slug: prizeSlug,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, tickets_left: 7, stock_left: 4 });

    expect(await ticketsOf()).toBe(7);
    expect(await claimedOf()).toContain(prizeSlug);
    expect(await stockOf(prizeSlug)).toBe(4);
  });

  it('rejects when the player cannot afford the prize and changes nothing', async () => {
    await seedParticipation(2);
    prizeSlug = await seedPrize(8, 5);

    const { error } = await playerClient.rpc('claim_prize', {
      p_event_id: eventId,
      p_prize_slug: prizeSlug,
    });
    expect(error).not.toBeNull();

    expect(await ticketsOf()).toBe(2);
    expect(await claimedOf()).not.toContain(prizeSlug);
    expect(await stockOf(prizeSlug)).toBe(5);
  });

  it('rejects when the prize is out of stock and changes nothing', async () => {
    await seedParticipation(50);
    prizeSlug = await seedPrize(3, 0);

    const { error } = await playerClient.rpc('claim_prize', {
      p_event_id: eventId,
      p_prize_slug: prizeSlug,
    });
    expect(error).not.toBeNull();

    expect(await ticketsOf()).toBe(50);
    expect(await claimedOf()).not.toContain(prizeSlug);
    expect(await stockOf(prizeSlug)).toBe(0);
  });

  it('rejects a second claim of an already-claimed prize (idempotent-safe)', async () => {
    prizeSlug = await seedPrize(3, 5);
    // Player already holds this prize; tickets should not be deducted twice.
    await seedParticipation(10, [prizeSlug]);

    const { error } = await playerClient.rpc('claim_prize', {
      p_event_id: eventId,
      p_prize_slug: prizeSlug,
    });
    expect(error).not.toBeNull();

    expect(await ticketsOf()).toBe(10);
    // Still claimed exactly once; stock untouched.
    expect((await claimedOf()).filter((s) => s === prizeSlug)).toHaveLength(1);
    expect(await stockOf(prizeSlug)).toBe(5);
  });

  /**
   * DEFERRED — the SP1 self-mutation hole (direct `update participations set
   * tickets=9999`) is NOT closed by this change. The broad client UPDATE grant
   * `update (tickets, pieces, badges, claimed, done_activities)` is still required
   * by the live StandScreen "Validar" path (actions.approve → approveActivity →
   * write-behind saveParticipation), which awards tickets/pieces/badges/
   * done_activities entirely client-side. Revoking the grant now would break that
   * gameplay path. Closing the hole requires first moving stand approval
   * server-side (the documented `approve_activity` RPC follow-up). Once that lands
   * and the grant is revoked in a follow-up migration, un-skip this test.
   */
  it.skip('rejects a direct client participation write once the grant is revoked', async () => {
    await seedParticipation(5);

    const { error } = await playerClient
      .from('participations')
      .update({ tickets: 9999 })
      .eq('player_id', playerId)
      .eq('event_id', eventId);

    // After the revoke this becomes a permission error (column update not granted).
    expect(error).not.toBeNull();
    expect(await ticketsOf()).toBe(5);
  });
});
