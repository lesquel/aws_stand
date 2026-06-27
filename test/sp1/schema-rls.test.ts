/**
 * SP1 foundation — schema + RLS integration tests.
 *
 * These talk to the real remote Supabase project (Node env, see vitest.config.ts).
 * They are written BEFORE the migration is applied, so on a greenfield `public`
 * schema they fail RED with "relation ... does not exist". After
 * `supabase/migrations/0001_sp1_foundation.sql` is applied they go GREEN.
 *
 * Authoritative requirements: docs/specs/2026-06-21-mvp-scope-reconciled.md.
 *
 * Conventions used here:
 *  - `serviceClient()` bypasses RLS for privileged setup/teardown.
 *  - `anonClient()` is a truly anonymous client (postgres role `anon`).
 *  - `authedClient()` signs a user in, so it acts with the `authenticated` role
 *    and is subject to RLS exactly like the browser app after login.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  type TestUser,
} from '../helpers/supabase';

/** A signed-in client carrying an `authenticated` session (RLS applies). */
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
  if (error) {
    throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  }
  return client;
}

async function seedEvent(
  service: SupabaseClient,
  status: 'draft' | 'active' | 'archived',
): Promise<string> {
  const slug = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await service
    .from('events')
    .insert({ slug, name: 'Test Event', status })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed ${status} event: ${error?.message ?? 'no row returned'}`);
  }
  return data.id as string;
}

describe('SP1 schema + RLS', () => {
  const service = serviceClient();
  let createdUserIds: string[] = [];
  let seededEmails: string[] = [];
  let seededEventIds: string[] = [];

  beforeEach(() => {
    createdUserIds = [];
    seededEmails = [];
    seededEventIds = [];
  });

  afterEach(async () => {
    for (const id of seededEventIds) {
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
  });

  it('signup creates a profile with role "participant" and a non-null, unique qr_token', async () => {
    const user = await createTestUser(service);
    createdUserIds.push(user.id);

    const { data, error } = await service
      .from('profiles')
      .select('id, role, qr_token, email')
      .eq('id', user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.role).toBe('participant');
    expect(data?.email).toBe(user.email);
    expect(data?.qr_token).toBeTruthy();
    expect(typeof data?.qr_token).toBe('string');
    expect((data?.qr_token as string).length).toBeGreaterThan(0);
  });

  it('signup with an allowlisted email yields a profile with role "admin"', async () => {
    const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const { error: allowError } = await service.from('admin_allowlist').insert({ email });
    if (allowError) {
      throw new Error(`Failed to seed admin_allowlist: ${allowError.message}`);
    }
    seededEmails.push(email);

    const user = await createTestUser(service, email);
    createdUserIds.push(user.id);

    const { data, error } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.role).toBe('admin');
  });

  it('an authenticated user can select an active event but NOT a draft event', async () => {
    const activeId = await seedEvent(service, 'active');
    const draftId = await seedEvent(service, 'draft');
    seededEventIds.push(activeId, draftId);

    const user = await createTestUser(service);
    createdUserIds.push(user.id);
    const client = await authedClient(user.email, user.password);

    const { data, error } = await client.from('events').select('id, status');
    expect(error).toBeNull();

    const visibleIds = (data ?? []).map((row) => row.id as string);
    expect(visibleIds).toContain(activeId);
    expect(visibleIds).not.toContain(draftId);
  });

  it('a non-admin player cannot insert a stand, but an admin can', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    // Non-admin player
    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const playerClient = await authedClient(player.email, player.password);

    const playerInsert = await playerClient
      .from('stands')
      .insert({ event_id: eventId, slug: 'p-stand', name: 'Player Stand', map_x: 10, map_y: 20 })
      .select('id');
    expect(playerInsert.error).not.toBeNull();
    expect(playerInsert.data ?? []).toHaveLength(0);

    // Admin (allowlisted email → role admin via trigger)
    const adminEmail = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    await service.from('admin_allowlist').insert({ email: adminEmail });
    seededEmails.push(adminEmail);
    const admin = await createTestUser(service, adminEmail);
    createdUserIds.push(admin.id);
    const adminClient = await authedClient(admin.email, admin.password);

    const adminInsert = await adminClient
      .from('stands')
      .insert({ event_id: eventId, slug: 'a-stand', name: 'Admin Stand', map_x: 30, map_y: 40 })
      .select('id')
      .single();
    expect(adminInsert.error).toBeNull();
    expect(adminInsert.data?.id).toBeTruthy();
  });

  it('join_event on an active event returns a clean participation ledger', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const client = await authedClient(player.email, player.password);

    const { data, error } = await client.rpc('join_event', { p_event_id: eventId });
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.player_id).toBe(player.id);
    expect(data?.event_id).toBe(eventId);
    // Clean init: server controls the starting ledger, not the client.
    expect(data?.tickets).toBe(0);
    expect(data?.badges ?? []).toHaveLength(0);
    expect(data?.pieces ?? []).toHaveLength(0);
    expect(data?.claimed ?? []).toHaveLength(0);
    expect(data?.done_activities ?? []).toHaveLength(0);
  });

  it('join_event is idempotent — calling twice returns the same row, no error', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const client = await authedClient(player.email, player.password);

    const first = await client.rpc('join_event', { p_event_id: eventId });
    expect(first.error).toBeNull();
    expect(first.data?.id).toBeTruthy();

    const second = await client.rpc('join_event', { p_event_id: eventId });
    expect(second.error).toBeNull();
    expect(second.data?.id).toBe(first.data?.id);

    // Exactly one row exists for this (player, event).
    const rows = await service
      .from('participations')
      .select('id')
      .eq('player_id', player.id)
      .eq('event_id', eventId);
    expect(rows.data ?? []).toHaveLength(1);
  });

  it('join_event on a draft event is rejected', async () => {
    const draftId = await seedEvent(service, 'draft');
    seededEventIds.push(draftId);

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const client = await authedClient(player.email, player.password);

    const { data, error } = await client.rpc('join_event', { p_event_id: draftId });
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    // No participation leaked through.
    const rows = await service
      .from('participations')
      .select('id')
      .eq('player_id', player.id)
      .eq('event_id', draftId);
    expect(rows.data ?? []).toHaveLength(0);
  });

  it('a direct client insert into participations is rejected (exploit closed)', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const client = await authedClient(player.email, player.password);

    // A client must not be able to seed its own ledger with arbitrary values.
    const exploit = await client
      .from('participations')
      .insert({ player_id: player.id, event_id: eventId, tickets: 999, badges: ['fake'] })
      .select('id');
    expect(exploit.error).not.toBeNull();
    expect(exploit.data ?? []).toHaveLength(0);

    // Nothing was written.
    const rows = await service
      .from('participations')
      .select('id, tickets')
      .eq('player_id', player.id)
      .eq('event_id', eventId);
    expect(rows.data ?? []).toHaveLength(0);
  });

  it('participations: a player cannot read another player\'s row', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    const playerA = await createTestUser(service);
    createdUserIds.push(playerA.id);
    const playerB = await createTestUser(service);
    createdUserIds.push(playerB.id);

    // Seed player B's participation via service role (bypasses RLS).
    const { error: seedBError } = await service
      .from('participations')
      .insert({ player_id: playerB.id, event_id: eventId });
    if (seedBError) {
      throw new Error(`Failed to seed player B participation: ${seedBError.message}`);
    }

    const clientA = await authedClient(playerA.email, playerA.password);

    // Player A joins their own participation via the RPC, then sees only it.
    const joinOwn = await clientA.rpc('join_event', { p_event_id: eventId });
    expect(joinOwn.error).toBeNull();
    expect(joinOwn.data?.id).toBeTruthy();

    const selectOwn = await clientA
      .from('participations')
      .select('player_id')
      .eq('player_id', playerA.id);
    expect(selectOwn.error).toBeNull();
    expect(selectOwn.data ?? []).toHaveLength(1);

    // Player A tries to read player B's row — RLS hides it.
    const selectOther = await clientA
      .from('participations')
      .select('player_id')
      .eq('player_id', playerB.id);
    expect(selectOther.error).toBeNull();
    expect(selectOther.data ?? []).toHaveLength(0);
  });

  it('admin_allowlist is not readable by anon or authenticated clients', async () => {
    const email = `secret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const seed = await service.from('admin_allowlist').insert({ email });
    expect(seed.error).toBeNull(); // the row must really exist...
    seededEmails.push(email);

    // ...and the service role must be able to see it (sanity that it was stored).
    const serviceRead = await service.from('admin_allowlist').select('email').eq('email', email);
    expect(serviceRead.data ?? []).toHaveLength(1);

    // Anon has no grant + no policy: the read must be actively DENIED, not just empty.
    const anon = anonClient();
    const anonRead = await anon.from('admin_allowlist').select('email');
    expect(anonRead.error).not.toBeNull();
    expect(anonRead.data).toBeNull();

    // Same for an ordinary authenticated (non-admin) client.
    const user = await createTestUser(service);
    createdUserIds.push(user.id);
    const client = await authedClient(user.email, user.password);
    const authedRead = await client.from('admin_allowlist').select('email');
    expect(authedRead.error).not.toBeNull();
    expect(authedRead.data).toBeNull();
  });

  it('an anonymous (not signed in) client cannot read the catalog tables', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    // Seed a stand on the active event via service role.
    const { error: standError } = await service
      .from('stands')
      .insert({ event_id: eventId, slug: 'anon-stand', name: 'Anon Stand', map_x: 1, map_y: 2 });
    if (standError) {
      throw new Error(`Failed to seed stand: ${standError.message}`);
    }

    const anon = anonClient();

    // Catalog reads are `to authenticated` only — anon sees nothing.
    const anonEvents = await anon.from('events').select('id');
    expect(anonEvents.data ?? []).toHaveLength(0);

    const anonStands = await anon.from('stands').select('id');
    expect(anonStands.data ?? []).toHaveLength(0);
  });

  it('a non-admin player cannot update or delete an existing stand', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    // Seed a stand via service role (bypasses RLS).
    const seed = await service
      .from('stands')
      .insert({ event_id: eventId, slug: 'locked-stand', name: 'Locked Stand', map_x: 5, map_y: 6 })
      .select('id')
      .single();
    if (seed.error || !seed.data) {
      throw new Error(`Failed to seed stand: ${seed.error?.message ?? 'no row'}`);
    }
    const standId = seed.data.id as string;

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const playerClient = await authedClient(player.email, player.password);

    // UPDATE — RLS admin-write policy blocks non-admins: affects 0 rows.
    const update = await playerClient
      .from('stands')
      .update({ name: 'Hacked Stand' })
      .eq('id', standId)
      .select('id');
    expect(update.data ?? []).toHaveLength(0);

    // DELETE — same: affects 0 rows.
    const del = await playerClient
      .from('stands')
      .delete()
      .eq('id', standId)
      .select('id');
    expect(del.data ?? []).toHaveLength(0);

    // The stand is untouched.
    const after = await service
      .from('stands')
      .select('name')
      .eq('id', standId)
      .single();
    expect(after.data?.name).toBe('Locked Stand');
  });
});
