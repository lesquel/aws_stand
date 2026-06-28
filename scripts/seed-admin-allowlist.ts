/**
 * Seed `admin_allowlist` from the ADMIN_EMAILS env var.
 *
 * The signup trigger (`handle_new_user`) grants role 'admin' to any new auth
 * user whose email is present in `admin_allowlist`. This script is the bootstrap
 * that populates that table from the server-side ADMIN_EMAILS env (comma
 * separated). Run it once per environment, and again whenever ADMIN_EMAILS
 * changes:
 *
 *   npm run seed:admin
 *
 * It is idempotent: emails are upserted with conflicts ignored, so re-running
 * never errors or duplicates. Emails are lowercased to match Supabase Auth,
 * which normalizes addresses to lowercase before the trigger compares them.
 *
 * Requires `SUPABASE_SERVICE_ROLE_KEY` — the table is service-role only (RLS on,
 * no client grants). No secrets or email values are printed.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local'), override: false, quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        'Set it in .env.local before running the admin allowlist seed.',
    );
  }
  return value;
}

/** Split ADMIN_EMAILS on commas, trim, lowercase, and drop empties. */
function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

async function main(): Promise<void> {
  const emails = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (emails.length === 0) {
    console.error('ADMIN_EMAILS is unset or empty — nothing to seed.');
    process.exitCode = 1;
    return;
  }

  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = emails.map((email) => ({ email }));
  const { error } = await supabase
    .from('admin_allowlist')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: true });
  if (error) {
    console.error(`Failed to seed admin_allowlist: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { count, error: countError } = await supabase
    .from('admin_allowlist')
    .select('email', { count: 'exact', head: true });
  if (countError) {
    console.error(`Seed upsert succeeded but row count failed: ${countError.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `admin_allowlist seeded: ${emails.length} email(s) processed from ADMIN_EMAILS; ` +
      `table now holds ${count} row(s).`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'unknown error';
  console.error(`admin allowlist seed failed: ${message}`);
  process.exitCode = 1;
});
