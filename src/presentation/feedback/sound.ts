'use client';

/* ============================================================
   Presentation · Sound feedback
   8-bit style SFX synthesized with the Web Audio API — no asset
   files. A single shared AudioContext, created lazily and resumed
   on the first user gesture (browser autoplay policy). Honors a
   global on/off flag driven by the Tweaks "sound" setting.
   ============================================================ */

let ctx: AudioContext | null = null;
let enabled = true;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/* resume the context inside a user gesture so the first blip can play */
export function primeAudio(): void {
  const c = audio();
  if (c && c.state === 'suspended') c.resume();
}

export function setSoundEnabled(on: boolean): void { enabled = !!on; }
export function isSoundEnabled(): boolean { return enabled; }

interface ToneOptions {
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  slideTo?: number | null;
  at?: number;
}

/* one short tone with a fast attack + exponential decay envelope */
function tone(freq: number, { type = 'square', dur = 0.08, gain = 0.12, slideTo = null, at = 0 }: ToneOptions = {}): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface ArpOptions {
  type?: OscillatorType;
  step?: number;
  gain?: number;
  dur?: number;
}

/* a quick ascending arpeggio (success / unlock fanfares) */
function arp(freqs: number[], { type = 'square', step = 0.06, gain = 0.13, dur = 0.09 }: ArpOptions = {}): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  freqs.forEach((f, i) => tone(f, { type, dur, gain, at: i * step }));
}

/* ---- the public SFX vocabulary ---- */

export function playClick(): void {
  if (!enabled) return;
  const c = audio();
  if (c && c.state === 'suspended') c.resume();
  tone(440, { type: 'square', dur: 0.06, gain: 0.09, slideTo: 660 });
}

export function playSuccess(): void {
  if (!enabled) return;
  arp([523, 659, 784]); // C5 · E5 · G5
}

export function playUnlock(): void {
  if (!enabled) return;
  arp([523, 659, 784, 1047], { step: 0.07, gain: 0.15 }); // C5 · E5 · G5 · C6
}

export function playPrize(): void {
  if (!enabled) return;
  arp([659, 784, 988, 1319], { type: 'triangle', step: 0.06, gain: 0.15 }); // E5 · G5 · B5 · E6
}
