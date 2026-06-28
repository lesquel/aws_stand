/**
 * SP2 Slice 1+2 — admin Events CRUD integration test.
 *
 * Exercises the thin admin repository (`supabase-admin-repository.ts`) against
 * the real remote Supabase project, acting through the anon client exactly like
 * the browser console does after an admin logs in:
 *
 *  - An admin (allowlisted email → role `admin` via the signup trigger) can
 *    `createEvent`, and the new event defaults to status `draft`.
 *  - `listEvents` returns ALL events for an admin, including drafts and archived
 *    ones (admin RLS is `for all using is_admin()`), unlike the player-facing
 *    read which only exposes `active` events.
 *  - `updateEvent` transitions an event's status (draft → active).
 *  - A duplicate slug surfaces as a friendly validation error, not a raw DB code.
 *  - A NON-admin player cannot create an event (admin-write RLS rejects it).
 *
 * Conventions mirror test/sp1/schema-rls.test.ts: `serviceClient()` for
 * privileged setup/teardown, a locally-built `authedClient()` for an
 * RLS-subject signed-in session.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/supabase';
import {
  createEvent,
  listEvents,
  updateEvent,
  slugify,
  EventValidationError,
} from '../../src/infrastructure/supabase-admin-repository';

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
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

function uniqueSlug(): string {
  return `sp2-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('SP2 — admin Events CRUD', () => {
  const service: SupabaseClient = serviceClient();
  let createdUserIds: string[] = [];
  let seededEmails: string[] = [];
  let createdEventIds: string[] = [];

  afterEach(async () => {
    for (const id of createdEventIds) {
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
    createdUserIds = [];
    seededEmails = [];
    createdEventIds = [];
  });

  async function makeAdminClient(): Promise<SupabaseClient> {
    const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const { error: allowError } = await service.from('admin_allowlist').insert({ email });
    if (allowError) throw new Error(`Failed to seed admin_allowlist: ${allowError.message}`);
    seededEmails.push(email);
    const admin = await createTestUser(service, email);
    createdUserIds.push(admin.id);
    return authedClient(admin.email, admin.password);
  }

  it('slugify derives a url-safe slug from a display name', () => {
    expect(slugify('Cloud Quest 2026')).toBe('cloud-quest-2026');
    expect(slugify('  Águila Día  ')).toBe('aguila-dia');
    expect(slugify('A--B__C')).toBe('a-b-c');
  });

  it('an admin can create an event that defaults to draft', async () => {
    const admin = await makeAdminClient();
    const slug = uniqueSlug();

    const event = await createEvent(admin, {
      name: 'SP2 Admin Event',
      slug,
      description: 'created in test',
    });
    createdEventIds.push(event.id);

    expect(event.id).toBeTruthy();
    expect(event.slug).toBe(slug);
    expect(event.name).toBe('SP2 Admin Event');
    expect(event.description).toBe('created in test');
    expect(event.status).toBe('draft');
  });

  it('listEvents returns draft events for an admin (not only active)', async () => {
    const admin = await makeAdminClient();

    const draft = await createEvent(admin, { name: 'Draft One', slug: uniqueSlug() });
    createdEventIds.push(draft.id);
    const active = await createEvent(admin, {
      name: 'Active One',
      slug: uniqueSlug(),
      status: 'active',
    });
    createdEventIds.push(active.id);

    const all = await listEvents(admin);
    const ids = all.map((e) => e.id);
    expect(ids).toContain(draft.id);
    expect(ids).toContain(active.id);

    const draftRow = all.find((e) => e.id === draft.id);
    expect(draftRow?.status).toBe('draft');
  });

  it('updateEvent transitions status draft → active', async () => {
    const admin = await makeAdminClient();
    const event = await createEvent(admin, { name: 'To Activate', slug: uniqueSlug() });
    createdEventIds.push(event.id);
    expect(event.status).toBe('draft');

    const updated = await updateEvent(admin, event.id, { status: 'active' });
    expect(updated.id).toBe(event.id);
    expect(updated.status).toBe('active');

    const after = await service
      .from('events')
      .select('status')
      .eq('id', event.id)
      .single();
    expect(after.data?.status).toBe('active');
  });

  it('a duplicate slug surfaces as a friendly validation error', async () => {
    const admin = await makeAdminClient();
    const slug = uniqueSlug();
    const first = await createEvent(admin, { name: 'First', slug });
    createdEventIds.push(first.id);

    await expect(createEvent(admin, { name: 'Second', slug })).rejects.toThrow(
      /identificador|slug|existe/i,
    );
  });

  it('rejects an empty name at the boundary before hitting the DB', async () => {
    const admin = await makeAdminClient();
    await expect(createEvent(admin, { name: '   ', slug: uniqueSlug() })).rejects.toBeInstanceOf(
      EventValidationError,
    );
  });

  it('a non-admin player cannot create an event (admin-write RLS rejects)', async () => {
    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const playerClient = await authedClient(player.email, player.password);

    await expect(
      createEvent(playerClient, { name: 'Sneaky', slug: uniqueSlug() }),
    ).rejects.toThrow();

    // Nothing leaked through: the service role sees no such event.
    const rows = await service.from('events').select('id').eq('name', 'Sneaky');
    expect(rows.data ?? []).toHaveLength(0);
  });
});
