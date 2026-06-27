/**
 * Test helpers for Supabase integration tests.
 *
 * Two client factories:
 *  - `anonClient()`    — uses the public anon key; subject to RLS, like the browser.
 *  - `serviceClient()` — uses the service-role key; bypasses RLS for setup/teardown.
 *
 * Plus `withTestUser()` / `createTestUser()` / `deleteTestUser()` to manage
 * throwaway auth users via the admin API.
 *
 * No keys are hardcoded or logged. The service-role key may be absent in the
 * environment; `serviceClient()` throws a clear error only when actually called.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        'Set it in .env.local (see CLAUDE.md) before running integration tests.',
    );
  }
  return value;
}

/**
 * Anonymous client — same access level as the app's browser client.
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 */
export function anonClient(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client — bypasses RLS for test setup/teardown.
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
 * Throws a clear error if the service-role key is not configured.
 */
export function serviceClient(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const TEST_USER_PASSWORD = 'test-password-1234!';

function randomTestEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `test-${suffix}@example.test`;
}

/**
 * Create a throwaway, email-confirmed auth user via the admin API.
 * Requires a valid service-role key.
 */
export async function createTestUser(
  client: SupabaseClient = serviceClient(),
  email: string = randomTestEmail(),
): Promise<TestUser> {
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message ?? 'unknown error'}`);
  }
  return { id: data.user.id, email, password: TEST_USER_PASSWORD };
}

/** Delete a throwaway auth user via the admin API. Requires a service-role key. */
export async function deleteTestUser(
  userId: string,
  client: SupabaseClient = serviceClient(),
): Promise<void> {
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
  }
}

/**
 * Run `fn` with a freshly created throwaway user, guaranteeing cleanup
 * even if the test body throws.
 */
export async function withTestUser<T>(
  fn: (user: TestUser, service: SupabaseClient) => Promise<T>,
): Promise<T> {
  const service = serviceClient();
  const user = await createTestUser(service);
  try {
    return await fn(user, service);
  } finally {
    await deleteTestUser(user.id, service);
  }
}

export type { SupabaseClient, User };
