/* ============================================================
   Infrastructure · Admin STAFF repository (browser-safe)

   The admin console's Staff section uses this. It NEVER touches the
   service-role key: account creation, assignment and listing all go through the
   server-only `/api/admin/staff` Route Handler, authenticated with the admin's
   own Supabase access token (bearer). The server route re-verifies the caller
   is an admin before doing anything.

   This file is intentionally free of any import from the `*-server` modules so
   the service-role client can never be pulled into the browser bundle.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

const STAFF_ENDPOINT = '/api/admin/staff';

export interface StaffAssignment {
  id: string;
  staffId: string;
  eventId: string;
  standId: string;
  username: string;
  email: string;
  createdAt: string | null;
}

export interface StaffSummary {
  id: string;
  email: string;
  username: string;
  role: 'staff';
  eventId: string;
  standId: string;
  assignmentId: string;
}

export interface CreateStaffPayload {
  username: string;
  email: string;
  password: string;
  eventId: string;
  standId: string;
  baseId?: string;
}

/** Bad input surfaced to the UI (kept symmetric with the server error names). */
export class StaffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffValidationError';
  }
}

/** Build the bearer auth header from the current session, or throw if signed out. */
async function authHeader(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffValidationError('No hay una sesión activa. Volvé a iniciar sesión.');
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
  throw new StaffValidationError(message);
}

/** Staff assigned to an event (enriched with username/email), via the server route. */
export async function listStaffAssignments(
  supabase: SupabaseClient,
  eventId: string,
): Promise<StaffAssignment[]> {
  if (!eventId) return [];
  const res = await fetch(`${STAFF_ENDPOINT}?eventId=${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: { authorization: await authHeader(supabase) },
  });
  if (!res.ok) await readError(res, 'No se pudo cargar el staff.');
  const json = (await res.json()) as { staff?: StaffAssignment[] };
  return json.staff ?? [];
}

/** Create a staff account and assign it to an event + stand, via the server route. */
export async function createStaff(
  supabase: SupabaseClient,
  payload: CreateStaffPayload,
): Promise<StaffSummary> {
  const res = await fetch(STAFF_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: await authHeader(supabase),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, 'No se pudo crear la cuenta de staff.');
  const json = (await res.json()) as { staff: StaffSummary };
  return json.staff;
}

/** Remove a staff assignment, via the server route. */
export async function unassignStaff(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<void> {
  const res = await fetch(`${STAFF_ENDPOINT}?assignmentId=${encodeURIComponent(assignmentId)}`, {
    method: 'DELETE',
    headers: { authorization: await authHeader(supabase) },
  });
  if (!res.ok) await readError(res, 'No se pudo quitar la asignación.');
}
