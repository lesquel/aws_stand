import type { Nav } from './domain/types';
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __quest?: { nav: Nav; setTweak: (k: any, v?: unknown) => void; setLang: (l: string) => void; reset: () => void };
  }
}
export {};
