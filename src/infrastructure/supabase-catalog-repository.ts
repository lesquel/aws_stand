/* ============================================================
   Infrastructure · Supabase catalog read repository
   Reads the ACTIVE event's stands (+ their single activity, RN-03) and prizes
   from Postgres and maps the rows to the domain `Stand`/`Activity`/`Prize`
   shapes (src/domain/types.ts).

   Read-path only: no writes, no mutation. When Supabase is not configured the
   loader falls back to the static catalog (src/domain/catalog.ts) so the app
   keeps working offline.

   RLS note: the catalog tables grant SELECT only to the `authenticated` role,
   so a meaningful read requires a logged-in session. The app loads the catalog
   after auth resolves; an unauthenticated read yields zero rows (handled here
   by falling back to the static catalog).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase-client';
import { STANDS, PRIZES } from '../domain/catalog';
import type { Stand, Activity, Prize, PieceId, Localized } from '../domain/types';

export interface CatalogData {
  stands: Stand[];
  prizes: Prize[];
}

/** Shape of the rows returned by the stands+activities select below. */
interface ActivityRow {
  slug: string;
  name: string;
  points_fixed: number;
  special: boolean | null;
  sort: number | null;
}
interface StandRow {
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
  // PostgREST returns a 1:1 embedded resource as an object (unique(stand_id)),
  // but tolerate an array form defensively.
  activities: ActivityRow | ActivityRow[] | null;
}
interface PrizeRow {
  slug: string;
  name: string;
  cost: number;
  stock: number;
  raffle: boolean | null;
}

// The DB stores a single string per label; wrap it as a bilingual value object.
// TODO i18n: English copy mirrors Spanish until per-locale columns exist.
const localized = (value: string | null): Localized => ({ es: value ?? '', en: value ?? '' });

// Sprites (prizes) are presentation assets the DB intentionally does not store;
// bridge them from the static catalog by slug.
const STATIC_PRIZE_SPRITE = new Map(PRIZES.map((p) => [p.id, p.sprite]));

function firstActivity(rows: ActivityRow | ActivityRow[] | null): ActivityRow | null {
  if (!rows) return null;
  return Array.isArray(rows) ? (rows[0] ?? null) : rows;
}

function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.slug,
    name: localized(row.name), // TODO i18n
    tickets: row.points_fixed,
    ...(row.special ? { special: true } : {}),
  };
}

function mapStand(row: StandRow): Stand {
  const act = firstActivity(row.activities);
  return {
    id: row.slug,
    icon: row.icon ?? '',
    color: row.color ?? '',
    accent: row.accent ?? '',
    name: localized(row.name), // TODO i18n
    tag: localized(row.tag), // TODO i18n
    blurb: localized(row.description), // TODO i18n
    piece: (row.piece_id ?? '') as PieceId,
    map: { x: Number(row.map_x), y: Number(row.map_y) },
    activities: act ? [mapActivity(act)] : [],
  };
}

function mapPrize(row: PrizeRow): Prize {
  return {
    id: row.slug,
    // sprite is a code-level asset (not event data); bridge from static catalog.
    sprite: STATIC_PRIZE_SPRITE.get(row.slug) ?? 'ic_trophy',
    name: localized(row.name), // TODO i18n
    cost: row.cost,
    stock: row.stock,
    ...(row.raffle ? { raffle: true } : {}),
  };
}

const STATIC_CATALOG: CatalogData = { stands: STANDS, prizes: PRIZES };

/**
 * Load the active event's catalog (stands + single activity + prizes) from the
 * DB, mapped to domain shapes. Falls back to the static catalog when:
 *  - no Supabase client is configured (offline), or
 *  - no active event exists.
 * Throws on an unexpected query error so the caller can decide how to recover.
 */
export async function loadCatalog(
  client: SupabaseClient | null = getSupabase(),
): Promise<CatalogData> {
  if (!client) return STATIC_CATALOG;

  const { data: event, error: eventError } = await client
    .from('events')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (eventError) throw new Error(`Failed to load active event: ${eventError.message}`);
  if (!event) return STATIC_CATALOG;

  const eventId = (event as { id: string }).id;

  const [standsResult, prizesResult] = await Promise.all([
    client
      .from('stands')
      .select(
        'slug,name,description,tag,map_x,map_y,icon,color,accent,piece_id,sort,' +
          'activities(slug,name,points_fixed,special,sort)',
      )
      .eq('event_id', eventId)
      .order('sort', { ascending: true }),
    client
      .from('prizes')
      .select('slug,name,cost,stock,raffle')
      .eq('event_id', eventId)
      .order('cost', { ascending: true }),
  ]);

  if (standsResult.error) throw new Error(`Failed to load stands: ${standsResult.error.message}`);
  if (prizesResult.error) throw new Error(`Failed to load prizes: ${prizesResult.error.message}`);

  const standRows = (standsResult.data ?? []) as unknown as StandRow[];
  const prizeRows = (prizesResult.data ?? []) as unknown as PrizeRow[];

  return { stands: standRows.map(mapStand), prizes: prizeRows.map(mapPrize) };
}
