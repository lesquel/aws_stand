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

  it('signup creates a profile with role "player" and a non-null, unique qr_token', async () => {
    const user = await createTestUser(service);
    createdUserIds.push(user.id);

    const { data, error } = await service
      .from('profiles')
      .select('id, role, qr_token, email')
      .eq('id', user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.role).toBe('player');
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

  it('participations: a player reads/inserts their own row but not another player\'s', async () => {
    const eventId = await seedEvent(service, 'active');
    seededEventIds.push(eventId);

    const playerA = await createTestUser(service);
    createdUserIds.push(playerA.id);
    const playerB = await createTestUser(service);
    createdUserIds.push(playerB.id);

    // Seed player B's participation via service role.
    const { error: seedBError } = await service
      .from('participations')
      .insert({ player_id: playerB.id, event_id: eventId });
    if (seedBError) {
      throw new Error(`Failed to seed player B participation: ${seedBError.message}`);
    }

    const clientA = await authedClient(playerA.email, playerA.password);

    // Player A inserts their own participation — allowed.
    const insertOwn = await clientA
      .from('participations')
      .insert({ player_id: playerA.id, event_id: eventId })
      .select('id')
      .single();
    expect(insertOwn.error).toBeNull();
    expect(insertOwn.data?.id).toBeTruthy();

    // Player A selects their own row — visible.
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

    const anon = anonClient();
    const anonRead = await anon.from('admin_allowlist').select('email');
    expect(anonRead.data ?? []).toHaveLength(0);

    const user = await createTestUser(service);
    createdUserIds.push(user.id);
    const client = await authedClient(user.email, user.password);
    const authedRead = await client.from('admin_allowlist').select('email');
    expect(authedRead.data ?? []).toHaveLength(0);
  });
});
