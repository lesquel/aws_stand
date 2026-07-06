/* ============================================================
   Infrastructure · Supabase admin STANDS repository (SP2 · Slice 3)

   Thin write/read surface for the admin console's Stands section. Runs through
   the SAME anon client the browser uses; access is enforced by the SP1
   admin-write RLS policies (`stands_admin_write` / `activities_admin_write` /
   `badges_admin_write`, each `for all using is_admin()`), so a signed-in admin
   reads and writes every stand while a non-admin's writes are rejected by the
   database.

   A stand owns exactly one activity (RN-03, `unique(stand_id)`) and that
   activity owns exactly one badge (RN-04, `unique(activity_id)`). Creating a
   stand therefore creates all three rows together.

   ATOMICITY: create/update go through the `admin_upsert_stand(payload jsonb)`
   SECURITY DEFINER RPC (migration 0002). The stand + activity + badge writes run
   inside ONE transaction (the function body), so any failure rolls the whole
   operation back — a failed activity/badge write can never leave an orphan stand
   (activity = null), which would violate RN-03. The previous design used
   sequential inserts with a cleanup-delete that, if it ALSO failed, left an
   orphan behind; that fragile path is gone.

   Validation happens at this boundary for UX (required name, valid slug, map
   coords within 0–100, points ≥ 0) BEFORE the RPC call; the DB constraints/RLS
   remain the authority. The RPC's own is_admin() gate enforces authorization.
   ============================================================ */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { slugify, isValidSlug } from './supabase-admin-repository';

export type ScoreType = 'fixed' | 'position';

export const SCORE_TYPES: readonly ScoreType[] = ['fixed', 'position'] as const;

export interface AdminBadge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export interface AdminActivity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  scoreType: ScoreType;
  pointsFixed: number;
  pointsFirst: number | null;
  pointsSecond: number | null;
  pointsThird: number | null;
  special: boolean;
  sort: number;
  badge: AdminBadge | null;
}

export interface AdminStand {
  id: string;
  eventId: string;
  slug: string;
  name: string;
  description: string | null;
  tag: string | null;
  mapX: number;
  mapY: number;
  icon: string | null;
  color: string | null;
  accent: string | null;
  pieceId: string | null;
  sort: number;
  activity: AdminActivity | null;
}

export interface ActivityInput {
  name: string;
  slug?: string;
  description?: string | null;
  scoreType?: ScoreType;
  pointsFixed?: number;
  pointsFirst?: number | null;
  pointsSecond?: number | null;
  pointsThird?: number | null;
  special?: boolean;
  sort?: number;
}

export interface BadgeInput {
  name: string;
  description?: string | null;
  icon?: string | null;
}

export interface CreateStandInput {
  name: string;
  slug?: string;
  description?: string | null;
  tag?: string | null;
  mapX: number;
  mapY: number;
  icon?: string | null;
  color?: string | null;
  accent?: string | null;
  pieceId?: string | null;
  sort?: number;
  activity: ActivityInput;
  badge: BadgeInput;
}

/** Editable subset for an update. The stand slug is intentionally not editable. */
export interface UpdateStandInput {
  name?: string;
  description?: string | null;
  tag?: string | null;
  mapX?: number;
  mapY?: number;
  icon?: string | null;
  color?: string | null;
  accent?: string | null;
  pieceId?: string | null;
  sort?: number;
  activity?: ActivityInput & { id?: string };
  badge?: BadgeInput & { id?: string };
}

/** Boundary validation failure (bad input) — distinct from a DB/RLS failure. */
export class StandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StandValidationError';
  }
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const COORD_MIN = 0;
const COORD_MAX = 100;

const STAND_SELECT =
  'id, event_id, slug, name, description, tag, map_x, map_y, icon, color, accent, piece_id, sort, ' +
  'activities ( id, slug, name, description, score_type, points_fixed, points_first, points_second, points_third, special, sort, ' +
  'badges ( id, name, description, icon ) )';

interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}
interface ActivityRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  score_type: string;
  points_fixed: number;
  points_first: number | null;
  points_second: number | null;
  points_third: number | null;
  special: boolean | null;
  sort: number | null;
  badges: BadgeRow | BadgeRow[] | null;
}
interface StandRow {
  id: string;
  event_id: string;
  slug: string;
  name: string;
  description: string | null;
  tag: string | null;
  map_x: number | string;
  map_y: number | string;
  icon: string | null;
  color: string | null;
  accent: string | null;
  piece_id: string | null;
  sort: number | null;
  activities: ActivityRow | ActivityRow[] | null;
}

/** PostgREST may return an embedded unique resource as an object or 1-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapBadge(row: BadgeRow): AdminBadge {
  return { id: row.id, name: row.name, description: row.description, icon: row.icon };
}

function mapActivity(row: ActivityRow): AdminActivity {
  const badge = firstOf(row.badges);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    scoreType: (row.score_type as ScoreType) ?? 'fixed',
    pointsFixed: row.points_fixed,
    pointsFirst: row.points_first,
    pointsSecond: row.points_second,
    pointsThird: row.points_third,
    special: row.special ?? false,
    sort: row.sort ?? 0,
    badge: badge ? mapBadge(badge) : null,
  };
}

function mapStand(row: StandRow): AdminStand {
  const activity = firstOf(row.activities);
  return {
    id: row.id,
    eventId: row.event_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    tag: row.tag,
    mapX: Number(row.map_x),
    mapY: Number(row.map_y),
    icon: row.icon,
    color: row.color,
    accent: row.accent,
    pieceId: row.piece_id,
    sort: row.sort ?? 0,
    activity: activity ? mapActivity(activity) : null,
  };
}

/** Turn a Postgrest error into a user-facing Error with a friendly message. */
function toFriendlyError(error: PostgrestError): Error {
  if (error.code === UNIQUE_VIOLATION) {
    return new StandValidationError('Ya existe un stand con ese identificador (slug) en este evento.');
  }
  if (error.code === FOREIGN_KEY_VIOLATION) {
    return new StandValidationError(
      'Este stand ya tiene participaciones registradas (jugadores acreditados). Archiva el evento en lugar de eliminar el stand.'
    );
  }
  return new Error(error.message || 'No se pudo completar la operación.');
}

function normalizeName(name: string, label: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new StandValidationError(`El nombre ${label} es obligatorio.`);
  return trimmed;
}

function normalizeSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (!isValidSlug(trimmed)) {
    throw new StandValidationError(
      'El identificador (slug) sólo admite minúsculas, números y guiones.',
    );
  }
  return trimmed;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCoord(value: number, axis: string): number {
  if (!Number.isFinite(value) || value < COORD_MIN || value > COORD_MAX) {
    throw new StandValidationError(`La coordenada ${axis} del mapa debe estar entre 0 y 100.`);
  }
  return value;
}

function normalizeScoreType(value: ScoreType | undefined): ScoreType {
  const type = value ?? 'fixed';
  if (!SCORE_TYPES.includes(type)) {
    throw new StandValidationError('Tipo de puntaje inválido.');
  }
  return type;
}

function normalizePoints(value: number | null | undefined, fallback: number | null): number | null {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new StandValidationError('Los puntos deben ser un número entero mayor o igual a 0.');
  }
  return value;
}

function normalizeSort(value: number | undefined): number {
  if (value == null) return 0;
  if (!Number.isInteger(value)) {
    throw new StandValidationError('El orden (sort) debe ser un número entero.');
  }
  return value;
}

/** Build the DB row payload for an activity from validated input. */
function activityPayload(input: ActivityInput): Record<string, unknown> {
  const scoreType = normalizeScoreType(input.scoreType);
  return {
    name: normalizeName(input.name, 'de la actividad'),
    slug: normalizeSlug(input.slug && input.slug.trim() ? input.slug : slugify(input.name)),
    description: normalizeText(input.description),
    score_type: scoreType,
    points_fixed: normalizePoints(input.pointsFixed, 1) ?? 1,
    points_first: normalizePoints(input.pointsFirst, null),
    points_second: normalizePoints(input.pointsSecond, null),
    points_third: normalizePoints(input.pointsThird, null),
    special: input.special ?? false,
    sort: normalizeSort(input.sort),
  };
}

/** Build the DB row payload for a badge from validated input. */
function badgePayload(input: BadgeInput): Record<string, unknown> {
  return {
    name: normalizeName(input.name, 'de la insignia'),
    description: normalizeText(input.description),
    icon: normalizeText(input.icon),
  };
}

/** All stands of an event (with their single activity + badge), ordered by sort. */
export async function listStands(
  supabase: SupabaseClient,
  eventId: string,
): Promise<AdminStand[]> {
  if (!eventId) throw new StandValidationError('Falta el identificador del evento.');
  const { data, error } = await supabase
    .from('stands')
    .select(STAND_SELECT)
    .eq('event_id', eventId)
    .order('sort', { ascending: true });
  if (error) throw toFriendlyError(error);
  return ((data ?? []) as unknown as StandRow[]).map(mapStand);
}

/** A single stand by id (with its activity + badge), or null when not found. */
export async function getStand(
  supabase: SupabaseClient,
  standId: string,
): Promise<AdminStand | null> {
  if (!standId) throw new StandValidationError('Falta el identificador del stand.');
  const { data, error } = await supabase
    .from('stands')
    .select(STAND_SELECT)
    .eq('id', standId)
    .maybeSingle();
  if (error) throw toFriendlyError(error);
  return data ? mapStand(data as unknown as StandRow) : null;
}

/** Call the atomic upsert RPC and return the affected stand id. */
async function upsertStandRpc(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_upsert_stand', { payload });
  if (error) throw toFriendlyError(error);
  if (typeof data !== 'string') {
    throw new Error('El servidor no devolvió el identificador del stand.');
  }
  return data;
}

/**
 * Create a stand together with its single activity and badge. Boundary
 * validation runs first; the three rows are then written atomically through the
 * `admin_upsert_stand` RPC, so a failure can never leave an orphan stand behind.
 */
export async function createStand(
  supabase: SupabaseClient,
  eventId: string,
  input: CreateStandInput,
): Promise<AdminStand> {
  if (!eventId) throw new StandValidationError('Falta el identificador del evento.');

  // Validate every payload up-front so a boundary error never reaches the DB.
  const standName = normalizeName(input.name, 'del stand');
  const standSlug = normalizeSlug(input.slug && input.slug.trim() ? input.slug : slugify(input.name));
  const stand = {
    slug: standSlug,
    name: standName,
    description: normalizeText(input.description),
    tag: normalizeText(input.tag),
    map_x: normalizeCoord(input.mapX, 'X'),
    map_y: normalizeCoord(input.mapY, 'Y'),
    icon: normalizeText(input.icon),
    color: normalizeText(input.color),
    accent: normalizeText(input.accent),
    piece_id: normalizeText(input.pieceId),
    sort: normalizeSort(input.sort),
  };
  const activity = activityPayload(input.activity);
  const badge = badgePayload(input.badge);

  const standId = await upsertStandRpc(supabase, { event_id: eventId, stand, activity, badge });

  const created = await getStand(supabase, standId);
  if (!created) throw new Error('El stand se creó pero no se pudo recargar.');
  return created;
}

/**
 * Update a stand's editable fields plus its activity and badge, atomically
 * through the `admin_upsert_stand` RPC. The stand slug is not editable (changing
 * a live slug breaks player-facing links). The RPC resolves and upserts the
 * single activity/badge by their parent ids, so no client-side row plumbing is
 * needed; only provided fields are patched.
 */
export async function updateStand(
  supabase: SupabaseClient,
  standId: string,
  input: UpdateStandInput,
): Promise<AdminStand> {
  if (!standId) throw new StandValidationError('Falta el identificador del stand.');

  const existing = await getStand(supabase, standId);
  if (!existing) throw new StandValidationError('El stand no existe.');

  // Partial patch: only include keys the caller actually provided. A present key
  // (even with a null value) is an explicit set; an absent key is left unchanged.
  const stand: Record<string, unknown> = {};
  if (input.name !== undefined) stand.name = normalizeName(input.name, 'del stand');
  if (input.description !== undefined) stand.description = normalizeText(input.description);
  if (input.tag !== undefined) stand.tag = normalizeText(input.tag);
  if (input.mapX !== undefined) stand.map_x = normalizeCoord(input.mapX, 'X');
  if (input.mapY !== undefined) stand.map_y = normalizeCoord(input.mapY, 'Y');
  if (input.icon !== undefined) stand.icon = normalizeText(input.icon);
  if (input.color !== undefined) stand.color = normalizeText(input.color);
  if (input.accent !== undefined) stand.accent = normalizeText(input.accent);
  if (input.pieceId !== undefined) stand.piece_id = normalizeText(input.pieceId);
  if (input.sort !== undefined) stand.sort = normalizeSort(input.sort);

  const payload: Record<string, unknown> = { stand_id: standId, stand };

  if (input.activity) {
    // Preserve the activity's existing slug instead of regenerating it from the
    // name; only override when the caller explicitly passes a new slug.
    const activityInput: ActivityInput = {
      ...input.activity,
      slug: input.activity.slug ?? existing.activity?.slug ?? undefined,
    };
    payload.activity = activityPayload(activityInput);
  }
  if (input.badge) {
    payload.badge = badgePayload(input.badge);
  }

  await upsertStandRpc(supabase, payload);

  const updated = await getStand(supabase, standId);
  if (!updated) throw new Error('El stand se actualizó pero no se pudo recargar.');
  return updated;
}

/** Delete a stand. ON DELETE CASCADE removes its activity and badge. */
export async function deleteStand(supabase: SupabaseClient, standId: string): Promise<void> {
  if (!standId) throw new StandValidationError('Falta el identificador del stand.');
  const { error } = await supabase.from('stands').delete().eq('id', standId);
  if (error) throw toFriendlyError(error);
}
