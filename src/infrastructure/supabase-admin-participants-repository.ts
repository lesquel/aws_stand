/* ============================================================
   Infrastructure · Admin PARTICIPANT repository (browser-safe)

   The admin console's Participants section uses this. It NEVER touches the
   service-role key: listing, editing and deleting all go through the
   server-only `/api/admin/participants` Route Handler, authenticated with the
   admin's own Supabase access token (bearer). The server route re-verifies the
   caller is an admin before doing anything.

   This file is intentionally free of any import from the `*-server` modules so
   the service-role client can never be pulled into the browser bundle.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

const PARTICIPANTS_ENDPOINT = '/api/admin/participants';

export interface Participant {
  id: string;
  username: string;
  email: string;
  createdAt: string | null;
}

/** Bad input surfaced to the UI (kept symmetric with the server error names). */
export class ParticipantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantValidationError';
  }
}

/** Build the bearer auth header from the current session, or throw if signed out. */
async function authHeader(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ParticipantValidationError('No hay una sesión activa. Vuelve a iniciar sesión.');
  }
  return `Bearer ${token}`;
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const json = (await res.json()) as { error?: string };
    if (json?.error) message = json.error;
  } catch {
    /* non-JSON response — keep the fallback */
  }
  throw new ParticipantValidationError(message);
}

/** All participant accounts, via the server route. */
export async function listParticipants(supabase: SupabaseClient): Promise<Participant[]> {
  const res = await fetch(PARTICIPANTS_ENDPOINT, {
    method: 'GET',
    headers: { authorization: await authHeader(supabase) },
  });
  if (!res.ok) await readError(res, 'No se pudieron cargar los participantes.');
  const json = (await res.json()) as { participants?: Participant[] };
  return json.participants ?? [];
}

/** Edit a participant's username, via the server route. */
export async function editParticipant(
  supabase: SupabaseClient,
  id: string,
  username: string,
): Promise<Participant> {
  const res = await fetch(PARTICIPANTS_ENDPOINT, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: await authHeader(supabase),
    },
    body: JSON.stringify({ id, username }),
  });
  if (!res.ok) await readError(res, 'No se pudo editar el participante.');
  const json = (await res.json()) as { participant: Participant };
  return json.participant;
}

/** Delete a participant account, via the server route. */
export async function deleteParticipant(supabase: SupabaseClient, id: string): Promise<void> {
  const res = await fetch(`${PARTICIPANTS_ENDPOINT}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: await authHeader(supabase) },
  });
  if (!res.ok) await readError(res, 'No se pudo eliminar el participante.');
}
