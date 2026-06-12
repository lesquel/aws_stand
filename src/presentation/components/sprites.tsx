'use client';

/* ============================================================
   Pixel sprite engine — data-driven sprites rendered to <canvas>
   ============================================================ */

import { useRef, useEffect } from 'react';
import React from 'react';

/* shared palette: char -> color (null = transparent) */
export const PAL: Record<string, string | null> = {
  '.': null,
  o: '#11162a',  // outline
  k: '#2a2440',  // soft outline
  W: '#ffffff',
  s: '#f4c9a0',  // skin
  S: '#d8996a',  // skin shadow
  h: '#4a3326',  // hair
  H: '#6b4a33',  // hair light
  r: '#ff9900',  // orange
  R: '#ec7211',  // orange dark
  b: '#2a3552',  // navy
  B: '#1c2740',  // navy dark
  c: '#36c5f0',  // cyan
  C: '#1b7fa0',
  g: '#2bd576',  // green
  G: '#178a4b',
  p: '#ff5c8a',  // pink
  P: '#c23a63',
  u: '#9b6dff',  // purple
  U: '#6b46c9',
  y: '#ffd23f',  // yellow
  Y: '#d9a516',
  w: '#c9d2e6',  // light steel
  d: '#7d8aa6',  // steel
  n: '#0c1119',
};

/* every sprite is 16x16 unless noted */
export const SPRITES: Record<string, string[]> = {
  /* ---- base character ---- */
  buddy: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohHHHHHHho...',
    '...osssssssso...',
    '..osssssssssso..',
    '..osWWossWWoso..',
    '..osWoossWooso..',
    '..osssssssssso..',
    '..osSssssssSso..',
    '...ossSSSSsso...',
    '....oossssoo....',
    '...orrrrrrrro...',
    '..orRrrrrrrRro..',
    '..orrrrrrrrrro..',
    '..oobboooobboo..',
  ],
  /* base character with long hair (same grid, hair frames the face) */
  buddy_girl: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohHHHHHHho...',
    '..ohhsssssshho..',
    '..ohssssssssho..',
    '..ohWWossWWoho..',
    '..ohWoossWooho..',
    '..ohssssssssho..',
    '..ohSssssssSho..',
    '..ohssSSSSssho..',
    '..ohoossssooho..',
    '..ohrrrrrrrrho..',
    '..orRrrrrrrRro..',
    '..orrrrrrrrrro..',
    '..oobboooobboo..',
  ],
  /* base with 3-stripe flag shirt — stripe colors come from pal keys 1/2/3 */
  buddy_stripe: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohHHHHHHho...',
    '...osssssssso...',
    '..osssssssssso..',
    '..osWWossWWoso..',
    '..osWoossWooso..',
    '..osssssssssso..',
    '..osSssssssSso..',
    '...ossSSSSsso...',
    '....oossssoo....',
    '...o11111111o...',
    '..o2222222222o..',
    '..o3333333333o..',
    '..oobboooobboo..',
  ],
  /* long-hair base with 3-stripe flag shirt */
  buddy_girl_stripe: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohHHHHHHho...',
    '..ohhsssssshho..',
    '..ohssssssssho..',
    '..ohWWossWWoho..',
    '..ohWoossWooho..',
    '..ohssssssssho..',
    '..ohSssssssSho..',
    '..ohssSSSSssho..',
    '..ohoossssooho..',
    '..oh11111111ho..',
    '..o2222222222o..',
    '..o3333333333o..',
    '..oobboooobboo..',
  ],
  /* base with vertical 5-stripe rainbow shirt — colors from pal keys 1-5 */
  buddy_rainbow: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohHHHHHHho...',
    '...osssssssso...',
    '..osssssssssso..',
    '..osWWossWWoso..',
    '..osWoossWooso..',
    '..osssssssssso..',
    '..osSssssssSso..',
    '...ossSSSSsso...',
    '....oossssoo....',
    '...o12233445o...',
    '..o1122334455o..',
    '..o1122334455o..',
    '..oobboooobboo..',
  ],
  /* ---- accessories (overlay) ---- */
  cap: [
    '................',
    '....rrrrrrrr....',
    '...rrWWWWWWrr...',
    '..rrrrrrrrrrrr..',
    '..RRRRRRRRRRRR..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  visor: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..CCCCCCCCCCCC..',
    '..cccWcccccccc..',
    '..ccccccccccCc..',
    '...C........C...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  shield: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.gggg...........',
    'gGgggg..........',
    'gGWggg..........',
    'gGgggg..........',
    'gGgggg..........',
    '.gGgg...........',
    '..gg............',
    '................',
    '................',
  ],
  backpack: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..............pp',
    '.............ppp',
    '....p....p...pPp',
    '....p....p...ppp',
    '....p....p...pp.',
    '....p....p......',
    '................',
    '................',
  ],
  boots: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...uu....uu.....',
    '..uUuu..uuUu....',
    '..uuuu..uuuu....',
  ],

  /* ---- stand icons ---- */
  ic_cloud: [
    '................',
    '................',
    '................',
    '......WWWW......',
    '.....WrrrrW.....',
    '...WWrrrrrrWW...',
    '..WrrrrrrrrrrW..',
    '.WrrrrrrrrrrrrW.',
    '.WrrrrrrrrrrrrW.',
    '..WWWWWWWWWWWW..',
    '................',
    '....o..o..o.....',
    '...o..o..o......',
    '................',
    '................',
    '................',
  ],
  ic_chip: [
    '................',
    '....c.c.c.c.....',
    '...ccccccccc....',
    '..cnnnnnnnnnc...',
    '.c.nWnnnnWn.c...',
    '...nnnnnnnn.c...',
    '.c.nnWWWWnn.....',
    '...nnWccWnn.c...',
    '.c.nnWccWnn.....',
    '...nnWWWWnn.c...',
    '.c.nnnnnnnn.....',
    '..cnnnnnnnnnc...',
    '...ccccccccc....',
    '....c.c.c.c.....',
    '................',
    '................',
  ],
  ic_shield: [
    '................',
    '.....gggggg.....',
    '....gggggggg....',
    '...gggggggggg...',
    '...ggGWWWGgg....',
    '...ggGWggGgg....',
    '...ggGWWWGgg....',
    '...ggGggWGgg....',
    '...ggGWWWGgg....',
    '....gggggggg....',
    '....gggggggg....',
    '.....gggggg.....',
    '......gggg......',
    '.......gg.......',
    '................',
    '................',
  ],
  ic_people: [
    '................',
    '...pp......pp...',
    '..pPPp....pPPp..',
    '..pPPp....pPPp..',
    '...pp......pp...',
    '..pppp....pppp..',
    '.pPpPPp..pPPpPp.',
    '.pPpPPp..pPPpPp.',
    '.ppppppppppppp..',
    '...WW......WW...',
    '..WWWW....WWWW..',
    '.WWWWWW..WWWWWW.',
    '.WWWWWW..WWWWWW.',
    '................',
    '................',
    '................',
  ],
  ic_gear: [
    '................',
    '......uuuu......',
    '...u..uuuu..u...',
    '..uuuuuuuuuuuu..',
    '..uuuuUUuuuuuu..',
    '...uuU..Uuuuu...',
    '.uuuU....Uuuuuu.',
    '.uuuU....Uuuuuu.',
    '.uuuU....Uuuuuu.',
    '...uuU..Uuuuu...',
    '..uuuuUUuuuuuu..',
    '..uuuuuuuuuuuu..',
    '...u..uuuu..u...',
    '......uuuu......',
    '................',
    '................',
  ],

  /* ---- badges / rewards ---- */
  ic_trophy: [
    '................',
    '...yyyyyyyyyy...',
    '..oyyyyyyyyyyo..',
    '.yoyyyyyyyyyyoy.',
    '.yoyyyyyyyyyyoy.',
    '.yyoyyyyyyyyoyy.',
    '..yyoyyyyyyoyy..',
    '...yyoyyyyoy....',
    '.....yyyyyy.....',
    '......yyyy......',
    '.......yy.......',
    '.....yyyyyy.....',
    '....yyyyyyyy....',
    '...YYYYYYYYYY...',
    '..YYYYYYYYYYYY..',
    '................',
  ],
  ic_compass: [
    '................',
    '.....oooooo.....',
    '...ooWWWWWWoo...',
    '..oWWWWWWWWWWo..',
    '.oWWWWWrWWWWWWo.',
    '.oWWWWrrrWWWWWo.',
    '.oWWWWWrWWWWWWo.',
    '.oWWWoWWWoWWWWo.',
    '.oWWWWWbWWWWWWo.',
    '.oWWWWbbbWWWWWo.',
    '.oWWWWWbWWWWWWo.',
    '..oWWWWWWWWWWo..',
    '...ooWWWWWWoo...',
    '.....oooooo.....',
    '................',
    '................',
  ],
  ic_bolt: [
    '................',
    '.......yyy......',
    '......yyy.......',
    '.....yyy........',
    '....yyyy........',
    '...yyyyyyy......',
    '......yyyy......',
    '.....yyyy.......',
    '....yyyy........',
    '...yyy..........',
    '..yyy...........',
    '.yy.............',
    '................',
    '................',
    '................',
    '................',
  ],
  ic_medal: [
    '................',
    '...c......c.....',
    '...cc....cc.....',
    '....cc..cc......',
    '.....cc.cc......',
    '......cccc......',
    '....yyYYYYyy....',
    '...yYWWWWWWYy...',
    '...yYWyyyyWYy...',
    '...yYWyWWyWYy...',
    '...yYWyyyyWYy...',
    '...yYWWWWWWYy...',
    '....yyYYYYyy....',
    '......yyyy......',
    '................',
    '................',
  ],
  ic_star: [
    '................',
    '.......yy.......',
    '.......yy.......',
    '......yyyy......',
    '......yyyy......',
    '.yyyyyyyyyyyyyy.',
    '..yyyyyyyyyyyy..',
    '...yyyyyyyyyy...',
    '....yyyyyyyy....',
    '...yyyyyyyyyy...',
    '...yyyy..yyyy...',
    '..yyy......yyy..',
    '.yy..........yy.',
    '................',
    '................',
    '................',
  ],

  /* ---- misc ---- */
  ticket: [
    '................',
    '................',
    '.yyyyyyyyyyyyyy.',
    '.yYWWWWWWWWWWYy.',
    '.yWyyyyyyyyyyWy.',
    'oyWyWWyWWyWWyWyo',
    '.oWyyyyyyyyyyWo.',
    'oyWyWWWyWWyWWyyo',
    '.yWyyyyyyyyyyWy.',
    '.yYWWWWWWWWWWYy.',
    '.yyyyyyyyyyyyyy.',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  coin: [
    '................',
    '.....yyyyyy.....',
    '...yyYYYYYYyy...',
    '..yYYWWWWWWYYy..',
    '..yYWyyyyyyWYy..',
    '.yYWyyWWWyyyWYy.',
    '.yYyyWYYYWyyyYy.',
    '.yYyyyyyYWyyyYy.',
    '.yYyyyWWWyyyyYy.',
    '.yYWyyyyyyyWYYy.',
    '..yYWyyyyyyWYy..',
    '..yyYYWWWWYYyy..',
    '...yyYYYYYYyy...',
    '.....yyyyyy.....',
    '................',
    '................',
  ],
  qr: [
    'nnnnnnnnnnnnnnnn',
    'nWWWWWnnnWWWWWWn',
    'nWnnnWnWnWnnnWWn',
    'nWnWnWnnnWnWnnWn',
    'nWnWnWnWnWnnWnWn',
    'nWnnnWnnnWnWWnWn',
    'nWWWWWnWnWnWnnWn',
    'nnnnnnnWWnnnWWnn',
    'nWWnWWnnnWWnnnWn',
    'nnWnnnWWnnWnWWnn',
    'nWnWWnnnWWnnnnWn',
    'nnnnnWWnnWWnWnnn',
    'nWWWWWnWnnnWWnWn',
    'nWnnnWnnWWnnnWnn',
    'nWnWnWnWWnWWnnWn',
    'nWWWWWnnnWnnWWnn',
  ],
  heart: [
    '................',
    '..pp......pp....',
    '.pPPp....pPPp...',
    'pPPPPp..pPPPPp..',
    'pPPPPPppPPPPPp..',
    'pPPPPPPPPPPPPp..',
    '.pPPPPPPPPPPp...',
    '..pPPPPPPPPp....',
    '...pPPPPPPp.....',
    '....pPPPPp......',
    '.....pPPp.......',
    '......pp........',
    '................',
    '................',
    '................',
    '................',
  ],
  flag: [
    '................',
    '...o............',
    '...orrrrrr......',
    '...orWrWrrr.....',
    '...orrrrrWr.....',
    '...orWrrrrr.....',
    '...orrrrWrr.....',
    '...orrrrrr......',
    '...o............',
    '...o............',
    '...o............',
    '...o............',
    '...o............',
    '..ooo...........',
    '................',
    '................',
  ],
};

/* draw a list of sprite-keys onto a canvas, with optional palette overrides */
export function paintSprite(
  canvas: HTMLCanvasElement,
  keys: string[],
  scale: number,
  palOverride?: Record<string, string | null>
): void {
  const pal = palOverride ? { ...PAL, ...palOverride } : PAL;
  const ctx = canvas.getContext('2d')!;
  const W = 16, H = 16;
  canvas.width = W * scale; canvas.height = H * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  for (const key of keys) {
    const rows = SPRITES[key];
    if (!rows) continue;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (c) { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, scale, scale); }
      }
    }
  }
}

export interface PixelSpriteProps {
  layers?: string[];
  sprite?: string;
  scale?: number;
  pal?: Record<string, string | null>;
  className?: string;
  style?: React.CSSProperties;
}

/* React sprite component. `layers` = array of sprite keys (composited bottom->top) */
export function PixelSprite({ layers, sprite, scale = 6, pal, className = '', style = {} }: PixelSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const keys = sprite ? [sprite] : (layers || []);
  const sig = keys.join('|') + ':' + scale + ':' + JSON.stringify(pal || {});
  useEffect(() => {
    if (ref.current) paintSprite(ref.current, keys, scale, pal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return <canvas ref={ref} className={'pixel-sprite ' + className} style={style} />;
}

export interface AvatarBase {
  id: string;
  name: string;
  es: string;
  en: string;
  sprite?: string; // base sprite key, defaults to 'buddy'
  pal: Record<string, string>;
}

/* skin tone ramps: [skin, skin shadow] */
const SKIN = {
  light: ['#f4c9a0', '#d8996a'],
  tan: ['#e0a878', '#b97f4e'],
  brown: ['#b97a50', '#8e5a38'],
  dark: ['#8a553a', '#66402b'],
  deep: ['#5f3a26', '#452a1b'],
};

/* hair color ramps: [hair, hair light] */
const HAIR = {
  brown: ['#4a3326', '#6b4a33'],
  black: ['#171221', '#2e2640'],
  blonde: ['#c98f2e', '#e8bb5c'],
  red: ['#a8341f', '#d45a35'],
};

/* shirt color ramps: [shirt, shirt dark] */
const SHIRT = {
  orange: ['#ff9900', '#ec7211'],
  cyan: ['#36c5f0', '#1b7fa0'],
  pink: ['#ff5c8a', '#c23a63'],
  green: ['#2bd576', '#178a4b'],
  purple: ['#9b6dff', '#6b46c9'],
  yellow: ['#ffd23f', '#d9a516'],
};

function pal(
  skin: keyof typeof SKIN,
  hair: keyof typeof HAIR,
  shirt: keyof typeof SHIRT
): Record<string, string> {
  return {
    s: SKIN[skin][0], S: SKIN[skin][1],
    h: HAIR[hair][0], H: HAIR[hair][1],
    r: SHIRT[shirt][0], R: SHIRT[shirt][1],
  };
}

/* avatar palette variants — original 4 ids kept stable for saved games */
export const AVATAR_BASES: AvatarBase[] = [
  { id: 'explorer', name: 'Explorador', es: 'Explorador', en: 'Explorer', pal: {} },
  { id: 'aqua', name: 'Aqua', es: 'Aqua', en: 'Aqua',
    pal: { r: '#36c5f0', R: '#1b7fa0', h: '#243a52', H: '#33597d' } },
  { id: 'nova', name: 'Nova', es: 'Nova', en: 'Nova',
    pal: { r: '#ff5c8a', R: '#c23a63', h: '#4a2a52', H: '#6b3d75' } },
  { id: 'robo', name: 'Robo', es: 'Robo', en: 'Robo',
    pal: { s: '#c9d2e6', S: '#9aa6c2', h: '#7d8aa6', H: '#9aa6c2', r: '#7d8aa6', R: '#566179' } },
  { id: 'sol', name: 'Sol', es: 'Sol', en: 'Sol',
    pal: pal('brown', 'black', 'yellow') },
  { id: 'kai', name: 'Kai', es: 'Kai', en: 'Kai',
    pal: pal('dark', 'black', 'green') },
  { id: 'ravi', name: 'Ravi', es: 'Ravi', en: 'Ravi',
    pal: pal('tan', 'brown', 'purple') },
  { id: 'rojo', name: 'Rojo', es: 'Rojo', en: 'Rojo',
    pal: pal('light', 'red', 'cyan') },
  { id: 'luna', name: 'Luna', es: 'Luna', en: 'Luna',
    sprite: 'buddy_girl', pal: pal('light', 'blonde', 'purple') },
  { id: 'maya', name: 'Maya', es: 'Maya', en: 'Maya',
    sprite: 'buddy_girl', pal: pal('tan', 'brown', 'cyan') },
  { id: 'zuri', name: 'Zuri', es: 'Zuri', en: 'Zuri',
    sprite: 'buddy_girl', pal: pal('dark', 'black', 'pink') },
  { id: 'amara', name: 'Amara', es: 'Amara', en: 'Amara',
    sprite: 'buddy_girl', pal: pal('deep', 'black', 'yellow') },
  { id: 'mei', name: 'Mei', es: 'Mei', en: 'Mei',
    sprite: 'buddy_girl', pal: pal('light', 'black', 'green') },
  { id: 'flor', name: 'Flor', es: 'Flor', en: 'Flor',
    sprite: 'buddy_girl', pal: pal('brown', 'red', 'orange') },
  /* pride avatars — flag-shirt colors via stripe keys */
  { id: 'ari', name: 'Ari', es: 'Ari', en: 'Ari',
    sprite: 'buddy_rainbow',
    pal: { ...pal('light', 'brown', 'orange'),
      '1': '#e40303', '2': '#ffed00', '3': '#008026', '4': '#0061ff', '5': '#732982' } },
  { id: 'vale', name: 'Vale', es: 'Vale', en: 'Vale',
    sprite: 'buddy_girl_stripe',
    pal: { ...pal('tan', 'red', 'orange'),
      '1': '#d52d00', '2': '#ffffff', '3': '#a30262' } },
  { id: 'skye', name: 'Skye', es: 'Skye', en: 'Skye',
    sprite: 'buddy_girl_stripe',
    pal: { ...pal('light', 'blonde', 'orange'),
      '1': '#5bcefa', '2': '#f5a9b8', '3': '#ffffff' } },
  { id: 'pau', name: 'Pau', es: 'Pau', en: 'Pau',
    sprite: 'buddy_stripe',
    pal: { ...pal('brown', 'black', 'orange'),
      '1': '#ff218c', '2': '#ffd800', '3': '#21b1ff' } },
];
