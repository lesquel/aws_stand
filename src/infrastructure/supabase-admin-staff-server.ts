/* ============================================================
   Infrastructure · Admin STAFF account management  ——  SERVER ONLY

   ⚠️  Uses the service-role client (`getServiceClient`), so it MUST stay
   server-side. Imported only by the `/api/admin/staff` Route Handler and the
   integration tests — never by a Client Component.

   Why server-side / service-role is required:
     - Creating an auth account needs the Supabase admin API (`auth.admin
       .createUser`), which only the service role can call.
     - Promoting a profile to `role = 'staff'` writes a column that is
       write-locked for `authenticated` clients (column grants in migration
       0001); only the service role may set it.
     - Listing staff with their display names embeds `profiles`, whose RLS
       (`profiles_select_own`) hides other users' rows from any signed-in
       admin. The service role bypasses RLS so the admin console can show real
       names/emails.

   EVERY exported operation re-verifies the caller is an admin against the
   database (`assertAdmin`) BEFORE doing anything privileged. This is the real
   authorization gate — the route's bearer-token check only proves identity;
   this proves the caller's role. A non-admin caller is rejected with a
   `StaffAuthorizationError` and nothing is created or changed.
   ============================================================ */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './supabase-admin-server';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const USERNAME_MIN = 2;
const USERNAME_MAX = 14;
const UNIQUE_VIOLATION = '23505';

/** Bad input supplied by the caller (HTTP 400 at the route boundary). */
export class StaffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffValidationError';
  }
}

/** Caller is not an admin / not authenticated (HTTP 403 at the route boundary). */
export class StaffAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffAuthorizationError';
  }
}

export interface CreateStaffInput {
  username: string;
  email: string;
  password: string;
  eventId: string;
  standId: string;
  baseId?: string;
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

export interface StaffAssignmentView {
  id: string;
  staffId: string;
  eventId: string;
  standId: string;
  username: string;
  email: string;
  createdAt: string | null;
}

interface EmbeddedProfile {
  username: string | null;
  email: string | null;
}

interface StaffAssignmentRow {
  id: string;
  staff_id: string;
  event_id: string;
  stand_id: string;
  created_at: string | null;
  profiles: EmbeddedProfile | EmbeddedProfile[] | null;
}

/** PostgREST may return an embedded resource as an object or a 1-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Authorization gate. Throws `StaffAuthorizationError` unless the caller's
 * profile role is exactly `'admin'`. Read through the service client so it is
 * not subject to the caller's own RLS.
 */
async function assertAdmin(service: SupabaseClient, callerId: string): Promise<void> {
  if (!callerId) {
    throw new StaffAuthorizationError('Falta la identidad del solicitante.');
  }
  const { data, error } = await service
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== 'admin') {
    throw new StaffAuthorizationError('Solo un administrador puede gestionar el staff.');
  }
}

function normalizeUsername(value: string): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX) {
    throw new StaffValidationError('El nombre del staff debe tener entre 2 y 14 caracteres.');
  }
  return trimmed;
}

function normalizeEmail(value: string): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new StaffValidationError('El email no es válido.');
  }
  return trimmed;
}

function normalizePassword(value: string): string {
  const password = value ?? '';
  if (password.length < PASSWORD_MIN) {
    throw new StaffValidationError('La contraseña debe tener al menos 8 caracteres.');
  }
  return password;
}

/**
 * Create a staff auth account and assign it to an event + stand. Admin-only.
 *
 * Steps (all server-side, service-role):
 *   1. Verify the caller is an admin.
 *   2. Validate inputs and confirm the event exists and the stand belongs to it.
 *   3. Create the email-confirmed auth user (the signup trigger seeds its
 *      profile as `participant`).
 *   4. Promote that profile to `role = 'staff'`.
 *   5. Insert the `staff_assignments` row.
 *
 * If step 4 or 5 fails, the freshly created auth user is deleted so a failure
 * never leaves an orphaned half-provisioned account behind.
 */
export async function createStaffAccount(
  callerId: string,
  input: CreateStaffInput,
): Promise<StaffSummary> {
  const service = getServiceClient();
  await assertAdmin(service, callerId);

  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  if (!input.eventId) throw new StaffValidationError('Falta el evento.');
  if (!input.standId) throw new StaffValidationError('Falta el stand.');
  const baseId = (input.baseId ?? 'explorer').trim() || 'explorer';

  // Event must exist.
  const { data: eventRow, error: eventErr } = await service
    .from('events')
    .select('id')
    .eq('id', input.eventId)
    .maybeSingle();
  if (eventErr) throw new Error(eventErr.message);
  if (!eventRow) throw new StaffValidationError('El evento no existe.');

  // Stand must exist AND belong to the chosen event.
  const { data: standRow, error: standErr } = await service
    .from('stands')
    .select('id, event_id')
    .eq('id', input.standId)
    .maybeSingle();
  if (standErr) throw new Error(standErr.message);
  if (!standRow) throw new StaffValidationError('El stand no existe.');
  if (standRow.event_id !== input.eventId) {
    throw new StaffValidationError('El stand no pertenece al evento seleccionado.');
  }

  // Create the auth user (email-confirmed so the staff can sign in immediately).
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, base_id: baseId },
  });
  if (createErr || !created?.user) {
    const message = createErr?.message ?? '';
    if (/already|registered|exists/i.test(message)) {
      throw new StaffValidationError('Ya existe una cuenta con ese email.');
    }
    throw new Error(message || 'No se pudo crear la cuenta de staff.');
  }
  const staffId = created.user.id;

  try {
    // Promote to staff (service-role bypasses the client column lock on `role`).
    // `.select(...).single()` forces a row to come back: a zero-row update
    // (e.g. the signup trigger never seeded the profile) then throws a clear
    // error instead of silently continuing to the assignment insert.
    const { error: roleErr } = await service
      .from('profiles')
      .update({ role: 'staff' })
      .eq('id', staffId)
      .select('id')
      .single();
    if (roleErr) throw new Error(roleErr.message);

    // Assign to the event + stand.
    const { data: assignment, error: assignErr } = await service
      .from('staff_assignments')
      .insert({ staff_id: staffId, event_id: input.eventId, stand_id: input.standId })
      .select('id')
      .single();
    if (assignErr) {
      if (assignErr.code === UNIQUE_VIOLATION) {
        throw new StaffValidationError('Este staff ya está asignado a ese stand.');
      }
      throw new Error(assignErr.message);
    }

    return {
      id: staffId,
      email,
      username,
      role: 'staff',
      eventId: input.eventId,
      standId: input.standId,
      assignmentId: assignment.id as string,
    };
  } catch (err) {
    // Roll back the half-provisioned account so no orphan is left behind.
    await service.auth.admin.deleteUser(staffId).catch(() => {
      /* best-effort rollback */
    });
    throw err;
  }
}

/**
 * Remove a single staff assignment (event + stand). Admin-only.
 *
 * This deletes ONLY the `staff_assignments` row — it deliberately does not
 * delete the auth account or downgrade the profile role, because the same staff
 * member may still be assigned to other stands/events.
 */
export async function unassignStaff(callerId: string, assignmentId: string): Promise<void> {
  const service = getServiceClient();
  await assertAdmin(service, callerId);
  if (!assignmentId) throw new StaffValidationError('Falta la asignación a quitar.');
  // The delete is keyed only by assignment id, NOT scoped to an event/org. This
  // is intentional for the current single-org admin model, where any admin may
  // manage every event. If the product ever grows to multiple independent
  // admins owning separate events, this becomes an IDOR (one admin could
  // unassign another org's staff by id) and must be event-scoped here.
  const { error } = await service.from('staff_assignments').delete().eq('id', assignmentId);
  if (error) throw new Error(error.message);
}

/**
 * List the staff assigned to an event, enriched with each staff member's
 * username/email. Admin-only. Goes through the service role because the
 * `profiles` RLS hides other users' rows from a signed-in admin.
 */
export async function listStaffForEvent(
  callerId: string,
  eventId: string,
): Promise<StaffAssignmentView[]> {
  const service = getServiceClient();
  await assertAdmin(service, callerId);
  if (!eventId) throw new StaffValidationError('Falta el evento.');

  const { data, error } = await service
    .from('staff_assignments')
    .select('id, staff_id, event_id, stand_id, created_at, profiles:staff_id ( username, email )')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as StaffAssignmentRow[]).map((row) => {
    const profile = firstOf(row.profiles);
    return {
      id: row.id,
      staffId: row.staff_id,
      eventId: row.event_id,
      standId: row.stand_id,
      createdAt: row.created_at,
      username: profile?.username ?? '',
      email: profile?.email ?? '',
    };
  });
}
