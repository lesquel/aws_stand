/* ============================================================
   Infrastructure · Supabase ADMIN server client  ——  SERVER ONLY

   ⚠️  THIS MODULE USES THE SERVICE-ROLE KEY (`SUPABASE_SERVICE_ROLE_KEY`).
   It MUST NEVER be imported from a Client Component, a `"use client"` file,
   or anything that ends up in the browser bundle. There is no `NEXT_PUBLIC_`
   prefix on the service-role key, so it is never shipped to the client. Only
   server-side code — Next.js Route Handlers under `app/api/**` and the
   integration tests — may import this file.

   The service-role client bypasses Row Level Security, so every caller of
   `getServiceClient()` is responsible for authenticating and authorizing the
   request BEFORE performing any privileged operation.
   ============================================================ */

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _service: SupabaseClient | null = null;

/**
 * Service-role Supabase client (bypasses RLS). Server-only.
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and the secret `SUPABASE_SERVICE_ROLE_KEY`.
 * Throws a clear error when the service-role key is not configured.
 */
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Server admin Supabase client is not configured. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only).',
    );
  }
  if (!_service) {
    _service = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _service;
}

/**
 * Validate a Supabase access token (JWT) and return the authenticated user id,
 * or `null` when the token is missing/invalid. Uses the public anon key — this
 * only verifies identity; it grants no privileges on its own.
 */
export async function getUserIdFromToken(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !token) return null;
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
