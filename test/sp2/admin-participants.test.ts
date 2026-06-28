/**
 * SP2 — admin Participant account management integration test (CA-09).
 *
 * Exercises the server-only core (`supabase-admin-participants-server.ts`)
 * directly, against the real remote Supabase project, using the service-role
 * client the same way the `/api/admin/participants` Route Handler does. Testing
 * the core functions avoids having to boot a Next.js server while still covering
 * the real DB behaviour (RLS-bypassing reads, username update, auth account
 * deletion + cascade).
 *
 * Security contract under test:
 *  - An ADMIN caller lists participants → sees participant profiles.
 *  - An ADMIN caller edits a participant username → persisted; verified via the
 *    service role. An invalid username is rejected at the boundary.
 *  - An ADMIN caller deletes a participant → both the profile and the auth user
 *    are gone (verified via the service role).
 *  - A NON-admin caller is rejected (ParticipantAuthorizationError) for list,
 *    edit and delete — and NOTHING changes.
 *  - Delete refuses a non-participant target (staff/admin), so this endpoint can
 *    never be used to remove privileged accounts.
 *
 * Conventions mirror test/sp2/admin-staff.test.ts. All created users are cleaned
 * up in afterEach.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/supabase';
import {
  listParticipants,
  editParticipant,
  deleteParticipant,
  ParticipantValidationError,
  ParticipantAuthorizationError,
} from '../../src/infrastructure/supabase-admin-participants-server';

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

describe('SP2 — admin Participant account management (CA-09)', () => {
  const service: SupabaseClient = serviceClient();
  let createdUserIds: string[] = [];
  let seededEmails: string[] = [];

  afterEach(async () => {
    for (const id of createdUserIds) {
      try {
        await deleteTestUser(id, service);
      } catch {
        /* best-effort teardown (may already be deleted by the test) */
      }
    }
    for (const email of seededEmails) {
      await service.from('admin_allowlist').delete().eq('email', email);
    }
    createdUserIds = [];
    seededEmails = [];
  });

  /** Create an allowlisted admin user and return its id. */
  async function makeAdmin(): Promise<{ id: string }> {
    const email = uniqueEmail('admin');
    const { error: allowError } = await service.from('admin_allowlist').insert({ email });
    if (allowError) throw new Error(`Failed to seed admin_allowlist: ${allowError.message}`);
    seededEmails.push(email);
    const admin = await createTestUser(service, email);
    createdUserIds.push(admin.id);
    // Touch the client sign-in to mirror the real flow / warm the account.
    await authedClient(admin.email, admin.password);
    return { id: admin.id };
  }

  /** Create a plain participant auth user (not allowlisted → role 'participant'). */
  async function makeParticipant(): Promise<{ id: string; email: string }> {
    const user = await createTestUser(service);
    createdUserIds.push(user.id);
    return { id: user.id, email: user.email };
  }

  it('lets an admin list participants', async () => {
    const admin = await makeAdmin();
    const participant = await makeParticipant();

    const list = await listParticipants(admin.id);
    const row = list.find((p) => p.id === participant.id);
    expect(row).toBeTruthy();
    expect(row?.email).toBe(participant.email);
    expect(typeof row?.username).toBe('string');
  });

  it('lets an admin edit a participant username (persisted)', async () => {
    const admin = await makeAdmin();
    const participant = await makeParticipant();

    const updated = await editParticipant(admin.id, participant.id, { username: 'Renamed' });
    expect(updated.id).toBe(participant.id);
    expect(updated.username).toBe('Renamed');

    const { data: profile } = await service
      .from('profiles')
      .select('username, role')
      .eq('id', participant.id)
      .maybeSingle();
    expect(profile?.username).toBe('Renamed');
    expect(profile?.role).toBe('participant');
  });

  it('rejects an invalid username at the boundary', async () => {
    const admin = await makeAdmin();
    const participant = await makeParticipant();

    await expect(
      editParticipant(admin.id, participant.id, { username: 'x' }),
    ).rejects.toBeInstanceOf(ParticipantValidationError);
    await expect(
      editParticipant(admin.id, participant.id, { username: 'way-too-long-username' }),
    ).rejects.toBeInstanceOf(ParticipantValidationError);
  });

  it('lets an admin delete a participant (profile + auth user gone)', async () => {
    const admin = await makeAdmin();
    const participant = await makeParticipant();

    await deleteParticipant(admin.id, participant.id);

    // Profile is gone.
    const { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('id', participant.id)
      .maybeSingle();
    expect(profile).toBeNull();

    // Auth user is gone.
    const { data: authUser } = await service.auth.admin.getUserById(participant.id);
    expect(authUser?.user ?? null).toBeNull();

    // Already deleted — drop from teardown list to avoid a noisy double-delete.
    createdUserIds = createdUserIds.filter((id) => id !== participant.id);
  });

  it('rejects a NON-admin caller for list, edit and delete (nothing changes)', async () => {
    const participant = await makeParticipant();
    const victim = await makeParticipant();

    await expect(listParticipants(participant.id)).rejects.toBeInstanceOf(
      ParticipantAuthorizationError,
    );
    await expect(
      editParticipant(participant.id, victim.id, { username: 'Hacked' }),
    ).rejects.toBeInstanceOf(ParticipantAuthorizationError);
    await expect(deleteParticipant(participant.id, victim.id)).rejects.toBeInstanceOf(
      ParticipantAuthorizationError,
    );

    // The victim is untouched: still present, original username.
    const { data: profile } = await service
      .from('profiles')
      .select('id, username')
      .eq('id', victim.id)
      .maybeSingle();
    expect(profile?.id).toBe(victim.id);
    expect(profile?.username).not.toBe('Hacked');
  });

  it('refuses to delete a non-participant (staff/admin) target', async () => {
    const admin = await makeAdmin();

    // Promote a fresh user to staff via the service role.
    const staff = await makeParticipant();
    const { error: promoteErr } = await service
      .from('profiles')
      .update({ role: 'staff' })
      .eq('id', staff.id)
      .select('id')
      .single();
    if (promoteErr) throw new Error(`Failed to promote staff: ${promoteErr.message}`);

    await expect(deleteParticipant(admin.id, staff.id)).rejects.toBeInstanceOf(
      ParticipantAuthorizationError,
    );

    // The staff auth user still exists.
    const { data: authUser } = await service.auth.admin.getUserById(staff.id);
    expect(authUser?.user?.id).toBe(staff.id);
  });
});
