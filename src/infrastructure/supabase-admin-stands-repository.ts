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

   ATOMICITY: no SECURITY DEFINER RPC is used. The three inserts run
   sequentially through RLS-guarded table writes; if the activity or badge
   insert fails, the just-created stand is deleted (its ON DELETE CASCADE removes
   any child rows), so a failed create never leaves a half-built stand behind.
   An `admin_upsert_stand` RPC would make this a single transaction and is a
   reasonable future optimization, but is NOT required for this slice.

   Validation happens at this boundary for UX (required name, valid slug, map
   coords within 0–100, points ≥ 0); the DB constraints/RLS remain the authority.
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

/**
 * Create a stand together with its single activity and badge. Sequential inserts
 * with cleanup-on-failure: if a later insert fails, the stand is deleted (ON
 * DELETE CASCADE removes any child rows) so no half-built stand is left behind.
 */
export async function createStand(
  supabase: SupabaseClient,
  eventId: string,
  input: CreateStandInput,
): Promise<AdminStand> {
  if (!eventId) throw new StandValidationError('Falta el identificador del evento.');

  // Validate every payload up-front so a boundary error never creates a stand.
  const standName = normalizeName(input.name, 'del stand');
  const standSlug = normalizeSlug(input.slug && input.slug.trim() ? input.slug : slugify(input.name));
  const standRow = {
    event_id: eventId,
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
  const activityRow = activityPayload(input.activity);
  const badgeRow = badgePayload(input.badge);

  const { data: created, error: standError } = await supabase
    .from('stands')
    .insert(standRow)
    .select('id')
    .single();
  if (standError) throw toFriendlyError(standError);
  const standId = (created as { id: string }).id;

  try {
    const { data: activity, error: activityError } = await supabase
      .from('activities')
      .insert({ ...activityRow, stand_id: standId })
      .select('id')
      .single();
    if (activityError) throw toFriendlyError(activityError);
    const activityId = (activity as { id: string }).id;

    const { error: badgeError } = await supabase
      .from('badges')
      .insert({ ...badgeRow, activity_id: activityId });
    if (badgeError) throw toFriendlyError(badgeError);
  } catch (err) {
    // Roll back the partial stand; cascade clears any child rows created so far.
    await supabase.from('stands').delete().eq('id', standId);
    throw err;
  }

  const stand = await getStand(supabase, standId);
  if (!stand) throw new Error('El stand se creó pero no se pudo recargar.');
  return stand;
}

/**
 * Update a stand's editable fields plus its activity and badge. The stand slug
 * is not editable (changing a live slug breaks player-facing links). Targets the
 * existing activity/badge rows; resolves their ids from the stand when not given.
 */
export async function updateStand(
  supabase: SupabaseClient,
  standId: string,
  input: UpdateStandInput,
): Promise<AdminStand> {
  if (!standId) throw new StandValidationError('Falta el identificador del stand.');

  const existing = await getStand(supabase, standId);
  if (!existing) throw new StandValidationError('El stand no existe.');

  const standPatch: Record<string, unknown> = {};
  if (input.name !== undefined) standPatch.name = normalizeName(input.name, 'del stand');
  if (input.description !== undefined) standPatch.description = normalizeText(input.description);
  if (input.tag !== undefined) standPatch.tag = normalizeText(input.tag);
  if (input.mapX !== undefined) standPatch.map_x = normalizeCoord(input.mapX, 'X');
  if (input.mapY !== undefined) standPatch.map_y = normalizeCoord(input.mapY, 'Y');
  if (input.icon !== undefined) standPatch.icon = normalizeText(input.icon);
  if (input.color !== undefined) standPatch.color = normalizeText(input.color);
  if (input.accent !== undefined) standPatch.accent = normalizeText(input.accent);
  if (input.pieceId !== undefined) standPatch.piece_id = normalizeText(input.pieceId);
  if (input.sort !== undefined) standPatch.sort = normalizeSort(input.sort);

  if (Object.keys(standPatch).length > 0) {
    const { error } = await supabase.from('stands').update(standPatch).eq('id', standId);
    if (error) throw toFriendlyError(error);
  }

  if (input.activity) {
    const activityId = input.activity.id ?? existing.activity?.id;
    const payload = activityPayload(input.activity);
    if (activityId) {
      const { error } = await supabase.from('activities').update(payload).eq('id', activityId);
      if (error) throw toFriendlyError(error);
    } else {
      const { error } = await supabase
        .from('activities')
        .insert({ ...payload, stand_id: standId });
      if (error) throw toFriendlyError(error);
    }
  }

  if (input.badge) {
    const badgeId = input.badge.id ?? existing.activity?.badge?.id;
    const payload = badgePayload(input.badge);
    if (badgeId) {
      const { error } = await supabase.from('badges').update(payload).eq('id', badgeId);
      if (error) throw toFriendlyError(error);
    } else {
      // Need an activity to attach the badge to.
      const activityId = input.activity?.id ?? existing.activity?.id;
      if (activityId) {
        const { error } = await supabase
          .from('badges')
          .insert({ ...payload, activity_id: activityId });
        if (error) throw toFriendlyError(error);
      }
    }
  }

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
