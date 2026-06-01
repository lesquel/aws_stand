/* ============================================================
   Domain · i18n value object
   A bilingual label is a plain { es, en } record. Pure, no deps.
   ============================================================ */

import type { Localized } from './types';

export const T = (es: string, en: string): Localized => ({ es, en });
