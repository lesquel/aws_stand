'use client';

/* ============================================================
   Pixel sprite engine — data-driven sprites rendered to <canvas>
   ============================================================ */

import { useRef, useEffect } from 'react';

/* shared palette: char -> color (null = transparent) */
export const PAL = {
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
export const SPRITES = {
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
export function paintSprite(canvas, keys, scale, palOverride) {
  const pal = palOverride ? { ...PAL, ...palOverride } : PAL;
  const ctx = canvas.getContext('2d');
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

/* React sprite component. `layers` = array of sprite keys (composited bottom->top) */
export function PixelSprite({ layers, sprite, scale = 6, pal, className = '', style = {} }) {
  const ref = useRef(null);
  const keys = sprite ? [sprite] : (layers || []);
  const sig = keys.join('|') + ':' + scale + ':' + JSON.stringify(pal || {});
  useEffect(() => {
    if (ref.current) paintSprite(ref.current, keys, scale, pal);
  }, [sig]);
  return <canvas ref={ref} className={'pixel-sprite ' + className} style={style} />;
}

/* avatar palette variants for the 4 base characters */
export const AVATAR_BASES = [
  { id: 'explorer', name: 'Explorador', es: 'Explorador', en: 'Explorer', pal: {} },
  { id: 'aqua', name: 'Aqua', es: 'Aqua', en: 'Aqua',
    pal: { r: '#36c5f0', R: '#1b7fa0', h: '#243a52', H: '#33597d' } },
  { id: 'nova', name: 'Nova', es: 'Nova', en: 'Nova',
    pal: { r: '#ff5c8a', R: '#c23a63', h: '#4a2a52', H: '#6b3d75' } },
  { id: 'robo', name: 'Robo', es: 'Robo', en: 'Robo',
    pal: { s: '#c9d2e6', S: '#9aa6c2', h: '#7d8aa6', H: '#9aa6c2', r: '#7d8aa6', R: '#566179' } },
];
