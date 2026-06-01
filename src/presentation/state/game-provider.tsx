'use client';

/* ============================================================
   Presentation · GameProvider
   Holds all shared game state (formerly in App.tsx) and exposes
   it via React Context + a useGame() hook.  Also owns the
   router-based nav() function so every screen can navigate
   without knowing about Next.js directly.
   ============================================================ */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { T } from '../../domain/i18n';
import { PIECES, standById, prizeById, decrementStock } from '../../domain/catalog';
import { emptyProgress } from '../../domain/progress';
import { badgeById } from '../../domain/badges';
import { completeActivity } from '../../application/complete-activity';
import { claimPrize } from '../../application/claim-prize';
import { createPlayer } from '../../application/create-player';
import { load, save, clear } from '../../infrastructure/local-storage-game-repository';
import { showToast } from '../feedback/toast';
import { fireConfetti } from '../feedback/confetti';
import { setSoundEnabled, primeAudio, playClick, playSuccess, playUnlock, playPrize } from '../feedback/sound';
import { useTweaks } from '../components/tweaks-panel';
import type { Lang, Progress, Player, CompleteResult, Localized, Actions, Nav } from '../../domain/types';

// Screens that require a logged-in player
const IN_APP = ['home', 'stand', 'avatar', 'badges', 'prizes'];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "es",
  "heroLayout": "center",
  "scanlines": true,
  "sound": true
}/*EDITMODE-END*/;

type TweakDefaults = typeof TWEAK_DEFAULTS;

// Screen → path mapping
const SCREEN_PATHS: Record<string, string> = {
  landing: '/',
  register: '/register',
  home: '/home',
  avatar: '/avatar',
  badges: '/badges',
  prizes: '/prizes',
  scanner: '/scanner',
  dashboard: '/dashboard',
};

// ── Context shape ─────────────────────────────────────────────────────────────

interface GameContextValue {
  lang: Lang;
  setLang: (l: string) => void;
  heroLayout: string;
  scanlines: boolean;
  soundOn: boolean;
  setTweak: (keyOrEdits: keyof TweakDefaults | Partial<TweakDefaults>, val?: unknown) => void;
  player: Player | null;
  progress: Progress;
  actions: Actions;
  nav: Nav;
  onCreate: (p: { name: string; baseId: string }) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function GameProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const lang = t.lang as Lang;
  const scanlines = t.scanlines as boolean;
  const heroLayout = t.heroLayout as string;
  const soundOn = t.sound as boolean;
  const setLang = (l: string) => setTweak('lang', l);

  const [player, setPlayer] = useState<Player | null>(null);
  const [progress, setProgress] = useState<Progress>(emptyProgress());

  // SSR-safe mount gate: reads localStorage only on the client
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const saved = load();
    if (saved?.player) setPlayer(saved.player);
    if (saved?.progress) setProgress(saved.progress);
    setMounted(true);
  }, []);

  // Persist game state whenever it changes — but NOT before the mount gate has
  // restored the saved state, or the first empty render would overwrite it.
  useEffect(() => {
    if (mounted) save({ player, progress });
  }, [player, progress, mounted]);

  // Keep the sound engine in sync with the tweak
  useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);

  // Blip on any button press (delegated: one listener covers every button)
  useEffect(() => {
    function onClickSound(e: MouseEvent) {
      primeAudio();
      const target = e.target as Element | null;
      const btn = target?.closest('button');
      if (btn && !(btn as HTMLButtonElement).disabled) playClick();
    }
    document.addEventListener('click', onClickSound);
    return () => document.removeEventListener('click', onClickSound);
  }, []);

  // Expose hooks for verifier / host
  useEffect(() => {
    window.__quest = {
      nav, setTweak, setLang,
      reset() { clear(); location.reload(); },
    };
  });

  // ── Navigator ──────────────────────────────────────────────────────────────

  const tx = (o: Localized) => o[lang];

  function nav(screen: string, params: Record<string, unknown> = {}) {
    if (IN_APP.includes(screen) && !player) {
      router.push('/register');
      return;
    }
    const path = screen === 'stand'
      ? `/stand/${params.standId}`
      : (SCREEN_PATHS[screen] ?? '/');
    router.push(path);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function complete(standId: string, actId: string): CompleteResult {
    const { progress: np, rewards } = completeActivity(progress, standId, actId);
    if (!rewards) return { tickets: 0 };
    setProgress(np);

    const stand = standById(standId);
    const act = stand?.activities.find(a => a.id === actId);
    if (act) showToast({ title: '+' + rewards.tickets + ' ' + tx(T('TICKETS', 'TICKETS')), sub: tx(act.name), sprite: 'ticket' });
    if (rewards.piece) showToast({ title: tx(T('¡Pieza nueva!', 'New piece!')), sub: tx(PIECES[rewards.piece].name), sprite: PIECES[rewards.piece].sprite, dur: 3200 });
    rewards.badges.forEach(bid => { const b = badgeById(bid); if (b) showToast({ title: tx(T('¡Insignia!', 'Badge!')), sub: tx(b.name), sprite: b.icon, dur: 3200 }); });
    if (!rewards.piece && !rewards.badges.length) fireConfetti({ count: 40, y: .5 });
    if (rewards.piece) playUnlock(); else playSuccess();

    return { tickets: rewards.tickets, piece: rewards.piece, badges: rewards.badges };
  }

  function claim(prizeId: string): void {
    const pz = prizeById(prizeId);
    const { progress: np, ok } = claimPrize(progress, pz);
    if (!ok || !pz) return;
    decrementStock(prizeId);
    setProgress(np);
    fireConfetti({ count: 90, colors: ['#ffd23f', '#ff9900', '#fff'] });
    showToast({ title: pz.raffle ? tx(T('¡Inscrito al sorteo!', 'Entered raffle!')) : tx(T('¡Premio canjeado!', 'Prize claimed!')), sub: tx(pz.name), sprite: pz.sprite, dur: 3000 });
    playPrize();
  }

  const actions: Actions = { complete, claim };

  // ── onCreate ───────────────────────────────────────────────────────────────

  function onCreate({ name, baseId }: { name: string; baseId: string }) {
    const p = createPlayer({ name, baseId });
    setPlayer(p);
    router.push('/home');
    setTimeout(() => { fireConfetti({ count: 80 }); showToast({ title: tx(T('¡Bienvenido!', 'Welcome!')), sub: p.name, sprite: 'flag' }); }, 250);
  }

  // Block render until client state is hydrated from localStorage
  if (!mounted) return null;

  return (
    <GameContext.Provider value={{ lang, setLang, heroLayout, scanlines, soundOn, setTweak, player, progress, actions, nav, onCreate }}>
      {children}
    </GameContext.Provider>
  );
}
