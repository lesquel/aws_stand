/**
 * SP2 Slice — admin Prizes CRUD integration test.
 *
 * Exercises the thin admin prizes repository
 * (`supabase-admin-prizes-repository.ts`) against the real remote Supabase
 * project, through the anon client exactly like the browser console does after
 * an admin logs in. Prizes are event-scoped with a unique (event_id, slug).
 *
 *  - An admin can `createPrize` under an event → it exists with cost/stock/raffle.
 *  - `listPrizes` returns the event's prizes for an admin.
 *  - `updatePrize` changes cost / stock / raffle (the slug stays locked).
 *  - A duplicate slug within the same event surfaces as a friendly error.
 *  - Negative cost / stock is rejected at the boundary BEFORE hitting the DB.
 *  - A NON-admin player cannot create a prize (admin-write RLS rejects it).
 *  - `deletePrize` removes the row.
 *
 * Conventions mirror test/sp2/admin-stands.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/supabase';
import { createEvent } from '../../src/infrastructure/supabase-admin-repository';
import {
  createPrize,
  listPrizes,
  updatePrize,
  deletePrize,
  PrizeValidationError,
} from '../../src/infrastructure/supabase-admin-prizes-repository';

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

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function prizeInput(slug: string) {
  return {
    name: 'Pack de stickers',
    slug,
    cost: 3,
    stock: 200,
    raffle: false,
  };
}

describe('SP2 — admin Prizes CRUD', () => {
  const service: SupabaseClient = serviceClient();
  let createdUserIds: string[] = [];
  let seededEmails: string[] = [];
  let createdEventIds: string[] = [];

  afterEach(async () => {
    // Deleting the event cascades to its prizes.
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

  async function makeEvent(admin: SupabaseClient): Promise<string> {
    const event = await createEvent(admin, {
      name: 'Prizes Host Event',
      slug: uniqueSlug('sp2-prize-evt'),
    });
    createdEventIds.push(event.id);
    return event.id;
  }

  it('an admin can create a prize under an event', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const slug = uniqueSlug('stickers');

    const prize = await createPrize(admin, eventId, prizeInput(slug));

    expect(prize.id).toBeTruthy();
    expect(prize.eventId).toBe(eventId);
    expect(prize.slug).toBe(slug);
    expect(prize.name).toBe('Pack de stickers');
    expect(prize.cost).toBe(3);
    expect(prize.stock).toBe(200);
    expect(prize.raffle).toBe(false);

    // Verify the row really exists through the service role.
    const { data } = await service.from('prizes').select('id, cost, stock, raffle').eq('id', prize.id);
    expect(data ?? []).toHaveLength(1);
  });

  it('derives the slug from the name when none is provided', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);

    const prize = await createPrize(admin, eventId, {
      name: `Gorra edición ${Date.now()}`,
      cost: 10,
      stock: 60,
    });

    expect(prize.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(prize.raffle).toBe(false); // defaults to false
  });

  it('lists the prizes of an event for an admin', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const a = await createPrize(admin, eventId, prizeInput(uniqueSlug('stickers')));
    const b = await createPrize(admin, eventId, {
      ...prizeInput(uniqueSlug('grand')),
      name: 'Sorteo grande',
      cost: 1,
      stock: 1,
      raffle: true,
    });

    const prizes = await listPrizes(admin, eventId);
    const ids = prizes.map((p) => p.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    const raffle = prizes.find((p) => p.id === b.id);
    expect(raffle?.raffle).toBe(true);
  });

  it('updatePrize changes cost, stock and raffle while keeping the slug locked', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const slug = uniqueSlug('stickers');
    const prize = await createPrize(admin, eventId, prizeInput(slug));

    const updated = await updatePrize(admin, prize.id, {
      name: 'Pack premium',
      cost: 5,
      stock: 120,
      raffle: true,
    });

    expect(updated.slug).toBe(slug); // unchanged
    expect(updated.name).toBe('Pack premium');
    expect(updated.cost).toBe(5);
    expect(updated.stock).toBe(120);
    expect(updated.raffle).toBe(true);

    const { data } = await service
      .from('prizes')
      .select('cost, stock, raffle')
      .eq('id', prize.id)
      .single();
    expect(data?.cost).toBe(5);
    expect(data?.stock).toBe(120);
    expect(data?.raffle).toBe(true);
  });

  it('rejects an empty name at the boundary before hitting the DB', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    await expect(
      createPrize(admin, eventId, { ...prizeInput(uniqueSlug('stickers')), name: '   ' }),
    ).rejects.toBeInstanceOf(PrizeValidationError);
  });

  it('rejects a negative cost at the boundary', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    await expect(
      createPrize(admin, eventId, { ...prizeInput(uniqueSlug('stickers')), cost: -1 }),
    ).rejects.toBeInstanceOf(PrizeValidationError);
  });

  it('rejects a negative stock at the boundary', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    await expect(
      createPrize(admin, eventId, { ...prizeInput(uniqueSlug('stickers')), stock: -5 }),
    ).rejects.toBeInstanceOf(PrizeValidationError);
  });

  it('rejects a duplicate slug within the same event as a friendly error', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const slug = uniqueSlug('stickers');
    await createPrize(admin, eventId, prizeInput(slug));

    await expect(createPrize(admin, eventId, prizeInput(slug))).rejects.toThrow(
      /identificador|slug|existe/i,
    );
  });

  it('a non-admin player cannot create a prize (admin-write RLS rejects)', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);

    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    const playerClient = await authedClient(player.email, player.password);

    await expect(
      createPrize(playerClient, eventId, prizeInput(uniqueSlug('stickers'))),
    ).rejects.toThrow();

    // Nothing leaked through: the service role sees no such prize.
    const { data } = await service.from('prizes').select('id').eq('event_id', eventId);
    expect(data ?? []).toHaveLength(0);
  });

  it('deletePrize removes the row', async () => {
    const admin = await makeAdminClient();
    const eventId = await makeEvent(admin);
    const prize = await createPrize(admin, eventId, prizeInput(uniqueSlug('stickers')));

    await deletePrize(admin, prize.id);

    const { data } = await service.from('prizes').select('id').eq('id', prize.id);
    expect(data ?? []).toHaveLength(0);
  });
});
