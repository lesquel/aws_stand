/* ============================================================
   Presentation · Admin · Stand authoring catalog

   The FIXED option sets the admin picks from when authoring a stand. There are
   NO uploads and NO storage buckets: icons are existing pixel sprite names
   (src/presentation/components/sprites.tsx) and colors are existing CSS design
   tokens (src/app/globals.css) paired with the accent hex the player map uses
   for the stand's neon outline. Avatar pieces mirror the collectible album
   (src/domain/catalog.ts) — the four-plus-one piece ids must never change.
   ============================================================ */

import type { PieceId } from '../../../domain/types';

/** Pixel sprite ids available as stand / badge icons (the `ic_*` set). */
export const ICON_OPTIONS: readonly string[] = [
  'ic_cloud',
  'ic_chip',
  'ic_shield',
  'ic_people',
  'ic_gear',
  'ic_bolt',
  'ic_compass',
  'ic_medal',
  'ic_star',
  'ic_trophy',
];

export interface ColorOption {
  /** CSS custom-property reference stored in `stands.color`. */
  token: string;
  /** Neon accent hex stored in `stands.accent` (the map outline color). */
  accent: string;
  /** Short human label for the picker. */
  label: string;
}

/** Color token + accent pairs, matching the five canonical stand palettes. */
export const COLOR_OPTIONS: readonly ColorOption[] = [
  { token: 'var(--orange)', accent: '#ff9900', label: 'Orange' },
  { token: 'var(--cyan)', accent: '#36c5f0', label: 'Cyan' },
  { token: 'var(--green)', accent: '#2bd576', label: 'Green' },
  { token: 'var(--pink)', accent: '#ff5c8a', label: 'Pink' },
  { token: 'var(--purple)', accent: '#9b6dff', label: 'Purple' },
];

export const DEFAULT_COLOR: ColorOption = COLOR_OPTIONS[0];

/** Collectible avatar pieces a stand can award (PieceId), with display labels. */
export const PIECE_OPTIONS: readonly { id: PieceId; label: string }[] = [
  { id: 'cap', label: 'Gorra' },
  { id: 'visor', label: 'Visor' },
  { id: 'shield', label: 'Escudo' },
  { id: 'backpack', label: 'Mochila' },
  { id: 'boots', label: 'Botas' },
];

/** Resolve the accent hex for a stored color token (falls back to the default). */
export function accentForToken(token: string | null | undefined): string {
  const match = COLOR_OPTIONS.find((c) => c.token === token);
  return match ? match.accent : DEFAULT_COLOR.accent;
}
