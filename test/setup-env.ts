/**
 * Vitest setup: load environment variables from `.env.local` into `process.env`
 * so integration tests can read the same config the app uses, plus the
 * server-side `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_EMAILS`.
 *
 * `override: false` keeps any value already present in the real environment
 * (for example values injected by CI) authoritative over the file.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local'), override: false, quiet: true });
