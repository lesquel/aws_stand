/* ============================================================
   Infrastructure · Supabase admin repository (SP2)

   Thin write/read surface for the admin console. Runs through the SAME anon
   client the browser uses; access is enforced by the SP1 admin RLS policies
   (`events_admin_write` is `for all using is_admin()`), so a signed-in admin
   reads and writes every event — including drafts and archived ones — while a
   non-admin's writes are rejected by the database.

   Validation happens at this boundary for UX (required name, valid slug, status
   in the enum); the DB constraints/RLS remain the authority. Single-row CRUD
   uses RLS-guarded table writes directly (no RPC needed) per the SP2 design.
   ============================================================ */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';

export type EventStatus = 'draft' | 'active' | 'archived';

export const EVENT_STATUSES: readonly EventStatus[] = ['draft', 'active', 'archived'] as const;

export interface AdminEvent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: EventStatus;
  createdAt: string | null;
}

export interface CreateEventInput {
  name: string;
  slug?: string;
  description?: string | null;
  status?: EventStatus;
}

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  status?: EventStatus;
}

/** Boundary validation failure (bad input) — distinct from a DB/RLS failure. */
export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventValidationError';
  }
}

const EVENT_COLUMNS = 'id,slug,name,description,status,created_at';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNIQUE_VIOLATION = '23505';

interface EventRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string | null;
}

/** Derive a url-safe slug from a display name (lowercase, accent-stripped). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function mapRow(row: EventRow): AdminEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: (row.status as EventStatus) ?? 'draft',
    createdAt: row.created_at,
  };
}

/** Turn a Postgrest error into a user-facing Error with a friendly message. */
function toFriendlyError(error: PostgrestError): Error {
  if (error.code === UNIQUE_VIOLATION) {
    return new EventValidationError('Ya existe un evento con ese identificador (slug).');
  }
  return new Error(error.message || 'No se pudo completar la operación.');
}

function normalizeStatus(status: EventStatus): EventStatus {
  if (!EVENT_STATUSES.includes(status)) {
    throw new EventValidationError('Estado de evento inválido.');
  }
  return status;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new EventValidationError('El nombre del evento es obligatorio.');
  return trimmed;
}

function normalizeSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidSlug(trimmed)) {
    throw new EventValidationError(
      'El identificador (slug) sólo admite minúsculas, números y guiones.',
    );
  }
  return trimmed;
}

function normalizeDescription(description: string | null | undefined): string | null {
  if (description == null) return null;
  const trimmed = description.trim();
  return trimmed ? trimmed : null;
}

/**
 * All events visible to the caller, newest first. For an admin this is every
 * event (draft/active/archived) via the admin-write RLS policy; for a
 * non-admin it would be only active events (player-facing policy).
 */
export async function listEvents(supabase: SupabaseClient): Promise<AdminEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw toFriendlyError(error);
  return ((data ?? []) as EventRow[]).map(mapRow);
}

/** Create an event. Defaults to `draft`. Auto-derives the slug from the name. */
export async function createEvent(
  supabase: SupabaseClient,
  input: CreateEventInput,
): Promise<AdminEvent> {
  const name = normalizeName(input.name);
  const slug = normalizeSlug(input.slug && input.slug.trim() ? input.slug : slugify(name));
  const status = normalizeStatus(input.status ?? 'draft');
  const description = normalizeDescription(input.description);

  const { data, error } = await supabase
    .from('events')
    .insert({ name, slug, status, description })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw toFriendlyError(error);
  return mapRow(data as EventRow);
}

/**
 * Update an event's editable fields (name, description, status). At least one
 * field must be provided. Returns the updated row; throws if the row does not
 * exist or the caller is not permitted (RLS update affects 0 rows).
 */
export async function updateEvent(
  supabase: SupabaseClient,
  id: string,
  input: UpdateEventInput,
): Promise<AdminEvent> {
  if (!id) throw new EventValidationError('Falta el identificador del evento.');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.description !== undefined) patch.description = normalizeDescription(input.description);
  if (input.status !== undefined) patch.status = normalizeStatus(input.status);

  if (Object.keys(patch).length === 0) {
    throw new EventValidationError('No hay cambios para guardar.');
  }

  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id)
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw toFriendlyError(error);
  return mapRow(data as EventRow);
}
