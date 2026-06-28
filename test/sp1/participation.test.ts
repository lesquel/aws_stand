/**
 * SP1 Slices 4+5 — participation repository integration test.
 *
 * Validates the per-event progress ledger and join flow
 * (src/infrastructure/supabase-participation-repository.ts):
 *  - joinEvent() goes through the SECURITY DEFINER join_event RPC, creating a
 *    clean participation (tickets 0, empty arrays) for the active event.
 *  - fetchParticipation() returns the caller's own participation.
 *  - join is idempotent on (player_id, event_id) and never wipes a populated
 *    ledger.
 *  - HARDENED CONTRACT (SP3 capstone, migration 0008): the client has NO write
 *    grant on participations. A direct client UPDATE is rejected; the ledger is
 *    mutated only by SECURITY DEFINER RPCs. (Pre-0008 this file asserted the old
 *    client-writable behavior via saveParticipation, now removed.)
 *
 * Mirrors catalog-repo.test.ts: a throwaway user is signed into an anon client
 * to reproduce the authenticated browser path; service-role is used only for
 * setup/teardown, populating ledgers, and cross-user assertions.
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
  joinEvent,
  fetchParticipation,
} from '../../src/infrastructure/supabase-participation-repository';
import { emptyProgress } from '../../src/domain/progress';

const EVENT_SLUG = 'aws-cloud-quest';

describe('SP1 participation repository — join + per-event progress', () => {
  let eventId: string;
  let authedA: SupabaseClient;
  let userAId: string;
  let authedB: SupabaseClient;
  let userBId: string;

  beforeAll(async () => {
    const service = serviceClient();

    const { data: ev, error: evErr } = await service
      .from('events')
      .select('id')
      .eq('slug', EVENT_SLUG)
      .eq('status', 'active')
      .maybeSingle();
    if (evErr || !ev) {
      throw new Error(
        `Seed event "${EVENT_SLUG}" not found/active: ${evErr?.message ?? 'missing'}. ` +
          'Apply supabase/seed.sql before running integration tests.',
      );
    }
    eventId = ev.id as string;

    const userA = await createTestUser(service);
    userAId = userA.id;
    authedA = anonClient();
    const signInA = await authedA.auth.signInWithPassword({
      email: userA.email,
      password: userA.password,
    });
    if (signInA.error) throw new Error(`Sign in A failed: ${signInA.error.message}`);

    const userB = await createTestUser(service);
    userBId = userB.id;
    authedB = anonClient();
    const signInB = await authedB.auth.signInWithPassword({
      email: userB.email,
      password: userB.password,
    });
    if (signInB.error) throw new Error(`Sign in B failed: ${signInB.error.message}`);
  });

  afterAll(async () => {
    const service = serviceClient();
    // Deleting the auth users cascades to their participations (FK on delete cascade).
    if (userAId) await deleteTestUser(userAId, service);
    if (userBId) await deleteTestUser(userBId, service);
  });

  it('joinEvent creates a clean participation for the active event', async () => {
    const participation = await joinEvent(authedA, eventId);
    expect(participation.eventId).toBe(eventId);
    expect(participation.id).toBeTruthy();
    expect(participation.progress).toEqual(emptyProgress());
  });

  it('fetchParticipation returns the caller’s own participation', async () => {
    await joinEvent(authedA, eventId);
    const participation = await fetchParticipation(authedA, eventId);
    expect(participation).not.toBeNull();
    expect(participation!.eventId).toBe(eventId);
    expect(participation!.progress.tickets).toBe(0);
  });

  it('join is idempotent on (player_id, event_id) and never wipes a populated ledger', async () => {
    const first = await joinEvent(authedA, eventId);
    const second = await joinEvent(authedA, eventId);
    expect(second.id).toBe(first.id);

    // Populate the ledger with service-role (the client can no longer write it),
    // then re-join: join_event uses `on conflict do nothing`, so it must not wipe.
    const service = serviceClient();
    const { error: seedErr } = await service
      .from('participations')
      .update({ tickets: 7, done_activities: ['c1'] })
      .eq('player_id', userAId)
      .eq('event_id', eventId);
    expect(seedErr).toBeNull();

    const third = await joinEvent(authedA, eventId);
    expect(third.id).toBe(first.id);
    expect(third.progress.tickets).toBe(7);
    expect(third.progress.doneActivities).toEqual(['c1']);
  });

  it('rejects a direct client write of the caller’s own participation (no UPDATE grant)', async () => {
    await joinEvent(authedA, eventId);

    // Reset to a known baseline with service-role, then attempt a self-award.
    const service = serviceClient();
    await service
      .from('participations')
      .update({ tickets: 0 })
      .eq('player_id', userAId)
      .eq('event_id', eventId);

    const { error } = await authedA
      .from('participations')
      .update({ tickets: 42 })
      .eq('player_id', userAId)
      .eq('event_id', eventId);

    // After 0008 the UPDATE grant is gone: either a permission error or a
    // zero-row update — never a successful mutation.
    if (!error) {
      const { data: changed } = await authedA
        .from('participations')
        .update({ tickets: 42 })
        .eq('player_id', userAId)
        .eq('event_id', eventId)
        .select('id');
      expect(changed ?? []).toHaveLength(0);
    } else {
      expect(error).not.toBeNull();
    }

    // Authoritative check: the ledger is unchanged.
    const { data } = await service
      .from('participations')
      .select('tickets')
      .eq('player_id', userAId)
      .eq('event_id', eventId)
      .single();
    expect(data!.tickets).toBe(0);
  });

  it('does not let a player write another player’s participation', async () => {
    // Both players hold their own clean participation.
    await joinEvent(authedA, eventId);
    await joinEvent(authedB, eventId);

    // A attempts to overwrite B's row. With no client UPDATE grant this is
    // rejected (or matches zero rows); B's row stays untouched either way.
    await authedA
      .from('participations')
      .update({ tickets: 9999 })
      .eq('player_id', userBId)
      .eq('event_id', eventId);

    // Verify B's row is untouched, read with service-role to bypass RLS.
    const service = serviceClient();
    const { data, error } = await service
      .from('participations')
      .select('tickets')
      .eq('player_id', userBId)
      .eq('event_id', eventId)
      .single();
    expect(error).toBeNull();
    expect(data!.tickets).toBe(0);
  });
});
