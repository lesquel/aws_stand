/**
 * SP1 Slices 4+5 — participation repository integration test.
 *
 * Validates the per-event progress ledger and join flow
 * (src/infrastructure/supabase-participation-repository.ts):
 *  - joinEvent() goes through the SECURITY DEFINER join_event RPC, creating a
 *    clean participation (tickets 0, empty arrays) for the active event.
 *  - fetchParticipation() returns the caller's own participation.
 *  - saveParticipation() persists the gameplay columns (tickets/pieces/badges/
 *    claimed/done_activities) and a re-fetch reflects them.
 *  - join is idempotent on (player_id, event_id).
 *  - RLS: a player cannot write another player's participation.
 *
 * Mirrors catalog-repo.test.ts: a throwaway user is signed into an anon client
 * to reproduce the authenticated browser path; service-role is used only for
 * setup/teardown and cross-user assertions.
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
  saveParticipation,
} from '../../src/infrastructure/supabase-participation-repository';
import { emptyProgress } from '../../src/domain/progress';
import type { Progress } from '../../src/domain/types';

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

  it('join is idempotent on (player_id, event_id)', async () => {
    const first = await joinEvent(authedA, eventId);
    const second = await joinEvent(authedA, eventId);
    expect(second.id).toBe(first.id);
    // Re-joining must not wipe a populated ledger…
    const populated: Progress = {
      ...emptyProgress(),
      tickets: 7,
      doneActivities: ['c1'],
    };
    await saveParticipation(authedA, userAId, eventId, populated);
    const third = await joinEvent(authedA, eventId);
    expect(third.id).toBe(first.id);
    expect(third.progress.tickets).toBe(7);
    expect(third.progress.doneActivities).toEqual(['c1']);
  });

  it('saveParticipation persists the gameplay columns and a re-fetch reflects them', async () => {
    await joinEvent(authedA, eventId);
    const next: Progress = {
      ...emptyProgress(),
      tickets: 42,
      pieces: ['cap', 'visor'],
      badges: ['explorer'],
      claimed: ['grand'],
      doneActivities: ['c1', 'b1'],
    };
    await saveParticipation(authedA, userAId, eventId, next);

    const reloaded = await fetchParticipation(authedA, eventId);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.progress.tickets).toBe(42);
    expect(reloaded!.progress.pieces).toEqual(['cap', 'visor']);
    expect(reloaded!.progress.badges).toEqual(['explorer']);
    expect(reloaded!.progress.claimed).toEqual(['grand']);
    expect(reloaded!.progress.doneActivities).toEqual(['c1', 'b1']);
    // lastPiece is a transient unlock signal — never restored from storage.
    expect(reloaded!.progress.lastPiece).toBeNull();
    // visitedStands is not a stored column — repo returns it empty (the provider
    // re-derives it from doneActivities against the catalog).
    expect(reloaded!.progress.visitedStands).toEqual([]);
  });

  it('does not let a player write another player’s participation (RLS)', async () => {
    // Both players hold their own clean participation.
    await joinEvent(authedA, eventId);
    await joinEvent(authedB, eventId);

    // A attempts to overwrite B's row (same event, B's id). RLS scopes the
    // UPDATE to auth.uid() = A, so zero rows match: no error, no effect.
    const tampered: Progress = { ...emptyProgress(), tickets: 9999 };
    await saveParticipation(authedA, userBId, eventId, tampered);

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
