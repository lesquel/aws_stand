/* ============================================================
   Infrastructure · Admin PARTICIPANT account management  ——  SERVER ONLY

   ⚠️  Uses the service-role client (`getServiceClient`), so it MUST stay
   server-side. Imported only by the `/api/admin/participants` Route Handler and
   the integration tests — never by a Client Component.

   Why server-side / service-role is required:
     - Listing participants reads `profiles`, whose RLS (`profiles_select_own`)
       hides every other user's row from a signed-in admin. The service role
       bypasses RLS so the admin console can show real participant accounts.
     - Editing a participant's `username` is allowed for `authenticated` clients
       only on THEIR OWN row (`profiles_update_own` + column grants). To edit
       someone else's username, the service role is required.
     - Deleting a participant account needs the Supabase admin API
       (`auth.admin.deleteUser`), which only the service role can call. Deleting
       the auth user cascades to its `profiles` row and `participations`
       (ON DELETE CASCADE in migration 0001).

   EVERY exported operation re-verifies the caller is an admin against the
   database (`assertAdmin`) BEFORE doing anything privileged. This is the real
   authorization gate — the route's bearer-token check only proves identity;
   this proves the caller's role. A non-admin caller is rejected with a
   `ParticipantAuthorizationError` and nothing is read or changed.

   This endpoint is deliberately scoped to `role = 'participant'`: it can never
   edit or delete a staff or admin account, so it cannot be abused to remove
   privileged users.
   ============================================================ */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './supabase-admin-server';

const USERNAME_MIN = 2;
const USERNAME_MAX = 14;
const PARTICIPANT_ROLE = 'participant';

/** Bad input supplied by the caller (HTTP 400 at the route boundary). */
export class ParticipantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantValidationError';
  }
}

/** Caller is not an admin / not authenticated (HTTP 403 at the route boundary). */
export class ParticipantAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantAuthorizationError';
  }
}

export interface ParticipantView {
  id: string;
  username: string;
  email: string;
  createdAt: string | null;
}

export interface EditParticipantInput {
  username: string;
}

interface ProfileRow {
  id: string;
  username: string | null;
  email: string | null;
  created_at: string | null;
}

/**
 * Authorization gate. Throws `ParticipantAuthorizationError` unless the caller's
 * profile role is exactly `'admin'`. Read through the service client so it is
 * not subject to the caller's own RLS.
 */
async function assertAdmin(service: SupabaseClient, callerId: string): Promise<void> {
  if (!callerId) {
    throw new ParticipantAuthorizationError('Falta la identidad del solicitante.');
  }
  const { data, error } = await service
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== 'admin') {
    throw new ParticipantAuthorizationError(
      'Solo un administrador puede gestionar las cuentas de participantes.',
    );
  }
}

function normalizeUsername(value: string): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX) {
    throw new ParticipantValidationError(
      'El nombre del participante debe tener entre 2 y 14 caracteres.',
    );
  }
  return trimmed;
}

function toView(row: ProfileRow): ParticipantView {
  return {
    id: row.id,
    username: row.username ?? '',
    email: row.email ?? '',
    createdAt: row.created_at,
  };
}

/**
 * List every participant account (id, username, email, created_at). Admin-only.
 * Goes through the service role because `profiles` RLS hides other users' rows
 * from a signed-in admin. Scoped to `role = 'participant'` so staff/admin rows
 * never appear here.
 */
export async function listParticipants(callerId: string): Promise<ParticipantView[]> {
  const service = getServiceClient();
  await assertAdmin(service, callerId);

  const { data, error } = await service
    .from('profiles')
    .select('id, username, email, created_at')
    .eq('role', PARTICIPANT_ROLE)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as ProfileRow[]).map(toView);
}

/**
 * Edit a participant's `username`. Admin-only.
 *
 * The update is scoped to `role = 'participant'`, so a staff/admin row can never
 * be modified through this endpoint. `.select(...).single()` forces a row back:
 * a zero-row update (wrong id, or the target is not a participant) then throws a
 * clear validation error instead of silently succeeding.
 */
export async function editParticipant(
  callerId: string,
  participantId: string,
  input: EditParticipantInput,
): Promise<ParticipantView> {
  const service = getServiceClient();
  await assertAdmin(service, callerId);

  if (!participantId) {
    throw new ParticipantValidationError('Falta el participante a editar.');
  }
  const username = normalizeUsername(input.username);

  const { data, error } = await service
    .from('profiles')
    .update({ username })
    .eq('id', participantId)
    .eq('role', PARTICIPANT_ROLE)
    .select('id, username, email, created_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new ParticipantValidationError('El participante no existe.');
  }

  return toView(data as ProfileRow);
}

/**
 * Delete a participant account. Admin-only.
 *
 * Refuses any target whose role is not `participant`, so this endpoint can never
 * remove a staff or admin account. Deletion goes through `auth.admin.deleteUser`,
 * which cascades to the `profiles` row and the user's `participations`
 * (ON DELETE CASCADE in migration 0001).
 */
export async function deleteParticipant(callerId: string, participantId: string): Promise<void> {
  const service = getServiceClient();
  await assertAdmin(service, callerId);

  if (!participantId) {
    throw new ParticipantValidationError('Falta el participante a eliminar.');
  }

  // Confirm the target exists AND is a participant before touching the account.
  const { data, error } = await service
    .from('profiles')
    .select('role')
    .eq('id', participantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new ParticipantValidationError('El participante no existe.');
  }
  if (data.role !== PARTICIPANT_ROLE) {
    throw new ParticipantAuthorizationError(
      'Solo se pueden eliminar cuentas de participantes.',
    );
  }

  const { error: deleteErr } = await service.auth.admin.deleteUser(participantId);
  if (deleteErr) throw new Error(deleteErr.message);
}
