/**
 * SP1 Slice 6 — admin role recognition integration test.
 *
 * Two contracts are verified here:
 *  1. The signup trigger (`handle_new_user`) assigns DB role `admin` to any
 *     auth user whose email is present in `admin_allowlist`. We seed an
 *     allowlist email via the service client, create the user (which fires the
 *     trigger), and assert the resulting profile row carries role `admin`.
 *  2. The repository's `toAppRole` mapping surfaces DB `admin` as the app-level
 *     `admin` role (previously it collapsed admin → player as a placeholder).
 *
 * Uses `serviceClient()` (bypasses RLS) for allowlist seeding and profile reads.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { serviceClient, deleteTestUser, type SupabaseClient } from '../helpers/supabase';
import { toAppRole } from '../../src/infrastructure/supabase-game-repository';

const TEST_PASSWORD = 'test-password-1234!';

function adminTestEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `admin-${suffix}@example.test`;
}

describe('SP1 Slice 6 — admin role recognition', () => {
  const service: SupabaseClient = serviceClient();
  let createdUserId: string | null = null;
  let seededEmail: string | null = null;

  afterEach(async () => {
    if (createdUserId) {
      await deleteTestUser(createdUserId, service);
      createdUserId = null;
    }
    if (seededEmail) {
      await service.from('admin_allowlist').delete().eq('email', seededEmail);
      seededEmail = null;
    }
  });

  it('assigns DB role "admin" to an allowlisted email on signup', async () => {
    const email = adminTestEmail();
    seededEmail = email;

    const { error: seedError } = await service
      .from('admin_allowlist')
      .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    expect(seedError).toBeNull();

    const { data, error } = await service.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    createdUserId = data.user!.id;

    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('role')
      .eq('id', createdUserId)
      .single();
    expect(profileError).toBeNull();
    expect(profile?.role).toBe('admin');
  });

  it('maps DB roles to the app role model via toAppRole', () => {
    expect(toAppRole('admin')).toBe('admin');
    expect(toAppRole('staff')).toBe('staff');
    expect(toAppRole('participant')).toBe('player');
  });
});
