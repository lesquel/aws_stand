/* ============================================================
   Infrastructure · Supabase admin PRIZES repository (SP2 · Prizes slice)

   Thin write/read surface for the admin console's Prizes section. Runs through
   the SAME anon client the browser uses; access is enforced by the SP1
   admin-write RLS policy (`prizes_admin_write` is `for all using is_admin()`),
   so a signed-in admin reads and writes every event's prizes while a non-admin's
   writes are rejected by the database.

   Prizes are event-scoped with `unique (event_id, slug)`. Single-row CRUD uses
   RLS-guarded table writes directly (no RPC needed) — same shape as the events
   repository. Validation happens at this boundary for UX (required name, valid
   slug, cost ≥ 0, stock ≥ 0); the DB constraints/RLS remain the authority.
   ============================================================ */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { slugify, isValidSlug } from './supabase-admin-repository';

export interface AdminPrize {
  id: string;
  eventId: string;
  slug: string;
  name: string;
  cost: number;
  stock: number;
  raffle: boolean;
}

export interface CreatePrizeInput {
  name: string;
  slug?: string;
  cost: number;
  stock: number;
  raffle?: boolean;
}

/** Editable subset for an update. The prize slug is intentionally not editable. */
export interface UpdatePrizeInput {
  name?: string;
  cost?: number;
  stock?: number;
  raffle?: boolean;
}

/** Boundary validation failure (bad input) — distinct from a DB/RLS failure. */
export class PrizeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrizeValidationError';
  }
}

const PRIZE_COLUMNS = 'id, event_id, slug, name, cost, stock, raffle';
const UNIQUE_VIOLATION = '23505';

interface PrizeRow {
  id: string;
  event_id: string;
  slug: string;
  name: string;
  cost: number;
  stock: number;
  raffle: boolean | null;
}

function mapRow(row: PrizeRow): AdminPrize {
  return {
    id: row.id,
    eventId: row.event_id,
    slug: row.slug,
    name: row.name,
    cost: row.cost,
    stock: row.stock,
    raffle: row.raffle ?? false,
  };
}

/** Turn a Postgrest error into a user-facing Error with a friendly message. */
function toFriendlyError(error: PostgrestError): Error {
  if (error.code === UNIQUE_VIOLATION) {
    return new PrizeValidationError(
      'Ya existe un premio con ese identificador (slug) en este evento.',
    );
  }
  return new Error(error.message || 'No se pudo completar la operación.');
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new PrizeValidationError('El nombre del premio es obligatorio.');
  return trimmed;
}

function normalizeSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidSlug(trimmed)) {
    throw new PrizeValidationError(
      'El identificador (slug) sólo admite minúsculas, números y guiones.',
    );
  }
  return trimmed;
}

function normalizeCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PrizeValidationError(`El ${label} debe ser un número entero mayor o igual a 0.`);
  }
  return value;
}

/** All prizes of an event, ordered by name. For an admin this is every prize. */
export async function listPrizes(
  supabase: SupabaseClient,
  eventId: string,
): Promise<AdminPrize[]> {
  if (!eventId) throw new PrizeValidationError('Falta el identificador del evento.');
  const { data, error } = await supabase
    .from('prizes')
    .select(PRIZE_COLUMNS)
    .eq('event_id', eventId)
    .order('name', { ascending: true });
  if (error) throw toFriendlyError(error);
  return ((data ?? []) as PrizeRow[]).map(mapRow);
}

/** Create a prize under an event. Auto-derives the slug from the name. */
export async function createPrize(
  supabase: SupabaseClient,
  eventId: string,
  input: CreatePrizeInput,
): Promise<AdminPrize> {
  if (!eventId) throw new PrizeValidationError('Falta el identificador del evento.');

  const name = normalizeName(input.name);
  const slug = normalizeSlug(input.slug && input.slug.trim() ? input.slug : slugify(name));
  const cost = normalizeCount(input.cost, 'costo');
  const stock = normalizeCount(input.stock, 'stock');
  const raffle = input.raffle ?? false;

  const { data, error } = await supabase
    .from('prizes')
    .insert({ event_id: eventId, slug, name, cost, stock, raffle })
    .select(PRIZE_COLUMNS)
    .single();
  if (error) throw toFriendlyError(error);
  return mapRow(data as PrizeRow);
}

/**
 * Update a prize's editable fields (name, cost, stock, raffle). The slug is not
 * editable (changing a live slug breaks player-facing links). At least one field
 * must be provided. Throws if the row does not exist or the caller is not
 * permitted (RLS update affects 0 rows).
 */
export async function updatePrize(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePrizeInput,
): Promise<AdminPrize> {
  if (!id) throw new PrizeValidationError('Falta el identificador del premio.');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.cost !== undefined) patch.cost = normalizeCount(input.cost, 'costo');
  if (input.stock !== undefined) patch.stock = normalizeCount(input.stock, 'stock');
  if (input.raffle !== undefined) patch.raffle = input.raffle;

  if (Object.keys(patch).length === 0) {
    throw new PrizeValidationError('No hay cambios para guardar.');
  }

  const { data, error } = await supabase
    .from('prizes')
    .update(patch)
    .eq('id', id)
    .select(PRIZE_COLUMNS)
    .single();
  if (error) throw toFriendlyError(error);
  return mapRow(data as PrizeRow);
}

/** Delete a prize. */
export async function deletePrize(supabase: SupabaseClient, id: string): Promise<void> {
  if (!id) throw new PrizeValidationError('Falta el identificador del premio.');
  const { error } = await supabase.from('prizes').delete().eq('id', id);
  if (error) throw toFriendlyError(error);
}
