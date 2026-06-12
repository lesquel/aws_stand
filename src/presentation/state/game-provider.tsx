'use client';

/* ============================================================
   Presentation · GameProvider
   Holds all shared game state and exposes it via React Context
   + useGame() hook. Owns auth lifecycle via Supabase.
   ============================================================ */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { T } from '../../domain/i18n';
import { PIECES, standById, prizeById, decrementStock } from '../../domain/catalog';
import { emptyProgress } from '../../domain/progress';
import { badgeById } from '../../domain/badges';
import { completeActivity } from '../../application/complete-activity';
import { approveActivity } from '../../application/approve-activity';
import { claimPrize } from '../../application/claim-prize';
import { load, save, clear } from '../../infrastructure/local-storage-game-repository';
import { getSupabase, supabaseConfigured } from '../../infrastructure/supabase-client';
import { fetchProfile, saveProgress, becomeStaffRpc, changeStandRpc } from '../../infrastructure/supabase-game-repository';
import { showToast } from '../feedback/toast';
import { fireConfetti } from '../feedback/confetti';
import { setSoundEnabled, primeAudio, playClick, playSuccess, playUnlock, playPrize } from '../feedback/sound';
import { useTweaks } from '../components/tweaks-panel';
import type { Lang, Progress, Player, CompleteResult, Localized, Actions, Nav, Role } from '../../domain/types';

// Screens that require a logged-in player
const IN_APP = ['home', 'stand', 'avatar', 'badges', 'prizes'];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "es",
  "heroLayout": "center",
  "scanlines": true,
  "sound": true
}/*EDITMODE-END*/;

type TweakDefaults = typeof TWEAK_DEFAULTS;

// Screen → path mapping (scanner omitted — its page self-redirects to /staff)
const SCREEN_PATHS: Record<string, string> = {
  landing: '/',
  register: '/register',
  login: '/login',
  home: '/home',
  avatar: '/avatar',
  badges: '/badges',
  prizes: '/prizes',
  staff: '/staff',
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
  signUp: (p: { username: string; email: string; password: string; baseId: string }) => Promise<void>;
  signIn: (p: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  becomeStaff: (standId: string, accessCode: string) => Promise<{ ok: boolean; error?: string }>;
  changeStand: (standId: string) => Promise<{ ok: boolean; error?: string }>;
  authError: string | null;
  confirmPending: boolean;
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
  const supabase = getSupabase();

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const lang = t.lang as Lang;
  const scanlines = t.scanlines as boolean;
  const heroLayout = t.heroLayout as string;
  const soundOn = t.sound as boolean;
  const setLang = (l: string) => setTweak('lang', l);
  const tx = (o: Localized) => o[lang];

  const [player, setPlayer] = useState<Player | null>(null);
  const [progress, setProgress] = useState<Progress>(emptyProgress());
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  // Debounce timer for write-behind progress saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  // Keep a stable ref to session for beforeunload
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;
  // Guard: tracks which user id is currently being loaded (prevents duplicate loadProfile runs)
  const loadingForRef = useRef<string | null>(null);

  // ── Auth lifecycle ────────────────────────────────────────────────────────
  // Single bootstrap: onAuthStateChange fires INITIAL_SESSION on cold start
  // (with or without an existing session), so we do NOT call getSession() separately.

  useEffect(() => {
    if (!supabase) {
      // No Supabase configured — fall back to localStorage only
      const saved = load();
      if (saved?.player) setPlayer(saved.player);
      if (saved?.progress) setProgress(saved.progress);
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s) {
        await loadProfile(s);
        setAuthLoading(false);
      } else {
        setPlayer(null);
        setProgress(emptyProgress());
        setAuthLoading(false);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(s: Session) {
    if (!supabase) return;
    // In-flight guard: skip if already loading for the same user
    if (loadingForRef.current === s.user.id) return;
    loadingForRef.current = s.user.id;
    try {
      const profile = await fetchProfile(supabase, s.user.id);
      if (!profile) return;

      // Legacy localStorage migration: if DB progress is empty and local has data, upload it
      const isEmptyDbProgress =
        profile.progress.doneActivities.length === 0 &&
        profile.progress.tickets === 0 &&
        profile.progress.pieces.length === 0;

      let resolvedProgress = profile.progress;

      if (isEmptyDbProgress) {
        const local = load();
        const hasLocalProgress =
          local?.progress &&
          (local.progress.doneActivities.length > 0 ||
            local.progress.tickets > 0 ||
            local.progress.pieces.length > 0);
        if (hasLocalProgress && local?.progress) {
          resolvedProgress = local.progress;
          try {
            await saveProgress(supabase, s.user.id, local.progress);
            // Only clear local data after successful save
            clear();
            setTimeout(() => showToast({
              title: tx(T('Progreso local recuperado', 'Local progress restored')),
              sprite: 'flag',
            }), 400);
          } catch {
            // Save failed — keep local data in memory; debounced writer will retry
            console.warn('[loadProfile] Migration save failed; keeping local progress in memory');
          }
        }
      }

      setPlayer({ name: profile.username, baseId: profile.baseId, role: profile.role, standId: profile.standId });
      setProgress(resolvedProgress);
    } finally {
      loadingForRef.current = null;
    }
  }

  // Write-behind: debounced progress save to Supabase when session exists.
  // Captures the user id at schedule time and validates it at fire time so a
  // sign-out during the 800ms window cannot write under the wrong user.
  useEffect(() => {
    if (!supabase || !session) return;
    const capturedUserId = session.user.id;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = sessionRef.current;
      if (!current || current.user.id !== capturedUserId) return;
      saveProgress(supabase!, capturedUserId, progressRef.current).catch((err) => {
        console.warn('[saveProgress] write-behind failed:', err);
      });
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, session]);

  // Flush on page unload
  useEffect(() => {
    if (!supabase) return;
    function flush() {
      const s = sessionRef.current;
      if (s) saveProgress(supabase!, s.user.id, progressRef.current).catch(() => { /* best-effort */ });
    }
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // localStorage fallback: persist when Supabase not configured
  useEffect(() => {
    if (!supabase && !authLoading) save({ player, progress });
  }, [player, progress, authLoading, supabase]);

  // Keep sound engine in sync with tweak
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

  // Expose debug hooks for verifier / host
  useEffect(() => {
    window.__quest = {
      nav, setTweak, setLang,
      reset() { clear(); if (supabase) supabase.auth.signOut(); location.reload(); },
    };
  });

  // ── Navigator ──────────────────────────────────────────────────────────────

  function nav(screen: string, params: Record<string, unknown> = {}) {
    if (IN_APP.includes(screen) && !player) {
      router.push('/login');
      return;
    }
    const path = screen === 'stand'
      ? `/stand/${params.standId}`
      : (SCREEN_PATHS[screen] ?? '/');
    router.push(path);
  }

  // ── Auth helpers ──────────────────────────────────────────────────────────

  function mapAuthError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
      return tx(T('Email o contraseña incorrectos', 'Wrong email or password'));
    }
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) {
      return tx(T('Este email ya está registrado', 'This email is already registered'));
    }
    if (m.includes('password should be at least') || m.includes('weak password') || m.includes('at least 6')) {
      return tx(T('La contraseña debe tener al menos 6 caracteres', 'Password must be at least 6 characters'));
    }
    return tx(T('Error de autenticación. Intenta de nuevo.', 'Authentication error. Please try again.'));
  }

  async function signUp({ username, email, password, baseId }: { username: string; email: string; password: string; baseId: string }) {
    if (!supabase) return;
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, base_id: baseId } },
    });
    if (error) { setAuthError(mapAuthError(error.message)); return; }
    if (!data.session) {
      // Email confirmation required — no session yet
      setConfirmPending(true);
    }
  }

  async function signIn({ email, password }: { email: string; password: string }) {
    if (!supabase) return;
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setAuthError(mapAuthError(error.message)); }
    // onAuthStateChange handles state update and profile load
  }

  async function signOut() {
    if (!supabase) return;
    // Clear pending debounce and do a best-effort final flush before signing out
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      const s = sessionRef.current;
      if (s) await saveProgress(supabase, s.user.id, progressRef.current);
    } catch {
      // best-effort — ignore
    }
    setConfirmPending(false);
    setAuthError(null);
    clear();
    await supabase.auth.signOut();
    // onAuthStateChange null branch will clear player/progress
    router.push('/');
  }

  async function becomeStaff(standId: string, accessCode: string): Promise<{ ok: boolean; error?: string }> {
    if (!supabase || !session || !player) return { ok: false };
    const ok = await becomeStaffRpc(supabase, standId, accessCode);
    if (!ok) {
      return { ok: false, error: tx(T('Código de acceso incorrecto', 'Wrong access code')) };
    }
    // Keep DB username and baseId — only update role/standId locally
    setPlayer({ ...player, role: 'staff', standId });
    setTimeout(() => showToast({ title: tx(T('¡Bienvenido al staff!', 'Welcome to staff!')), sprite: 'flag' }), 250);
    router.push('/staff');
    return { ok: true };
  }

  async function changeStand(standId: string): Promise<{ ok: boolean; error?: string }> {
    if (!supabase || !session || !player) return { ok: false };
    const ok = await changeStandRpc(supabase, standId);
    if (!ok) {
      return { ok: false, error: tx(T('No se pudo cambiar el stand', 'Could not change stand')) };
    }
    setPlayer({ ...player, standId });
    setTimeout(() => showToast({ title: tx(T('Stand actualizado', 'Stand updated')), sub: player.name, sprite: 'flag' }), 250);
    router.push('/staff');
    return { ok: true };
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function applyRewardEffects(
    np: Progress,
    standId: string,
    actId: string,
    rewards: { tickets: number; piece: string | null; badges: string[] }
  ): CompleteResult {
    setProgress(np);
    const stand = standById(standId);
    const act = stand?.activities.find(a => a.id === actId);
    if (act) showToast({ title: '+' + rewards.tickets + ' ' + tx(T('TICKETS', 'TICKETS')), sub: tx(act.name), sprite: 'ticket' });
    if (rewards.piece) showToast({ title: tx(T('¡Pieza nueva!', 'New piece!')), sub: tx(PIECES[rewards.piece as keyof typeof PIECES].name), sprite: PIECES[rewards.piece as keyof typeof PIECES].sprite, dur: 3200 });
    rewards.badges.forEach(bid => { const b = badgeById(bid); if (b) showToast({ title: tx(T('¡Insignia!', 'Badge!')), sub: tx(b.name), sprite: b.icon, dur: 3200 }); });
    if (!rewards.piece && !rewards.badges.length) fireConfetti({ count: 40, y: .5 });
    if (rewards.piece) playUnlock(); else playSuccess();
    return { tickets: rewards.tickets, piece: rewards.piece as CompleteResult['piece'], badges: rewards.badges };
  }

  function complete(standId: string, actId: string): CompleteResult {
    const { progress: np, rewards } = completeActivity(progress, standId, actId);
    if (!rewards) return { tickets: 0 };
    return applyRewardEffects(np, standId, actId, rewards);
  }

  function approve(standId: string, actId: string, code: string): { ok: false } | ({ ok: true } & CompleteResult) {
    const result = approveActivity(progress, standId, actId, code);
    if (!result.ok) return { ok: false };
    const { progress: np, tickets, piece, badges } = result;
    if (tickets === 0 && !piece && (!badges || !badges.length)) {
      setProgress(np);
      return { ok: true, tickets: 0 };
    }
    const cr = applyRewardEffects(np, standId, actId, { tickets, piece: piece ?? null, badges: badges ?? [] });
    return { ok: true, ...cr };
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

  const actions: Actions = { complete, approve, claim };

  // ── Render gate ───────────────────────────────────────────────────────────

  // Supabase not configured — render a clear notice instead of crashing
  if (!supabaseConfigured()) {
    const msg = tx(T('Falta configurar Supabase (.env.local)', 'Supabase is not configured (.env.local)'));
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div className="pixel" style={{ fontSize: 12, color: 'var(--orange)', marginBottom: 16 }}>⚠ CLOUD QUEST</div>
          <p className="t" style={{ color: 'var(--ink)' }}>{msg}</p>
          <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 10 }}>
            Copy <code>.env.local.example</code> → <code>.env.local</code> and fill in your Supabase keys.
          </p>
        </div>
      </div>
    );
  }

  // Block render until auth state is resolved — show a minimal pixel-font splash
  if (authLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div className="pixel" style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: 3 }}>
          {tx(T('CARGANDO...', 'LOADING...'))}
        </div>
      </div>
    );
  }

  return (
    <GameContext.Provider value={{
      lang, setLang, heroLayout, scanlines, soundOn, setTweak,
      player, progress, actions, nav,
      signUp, signIn, signOut, becomeStaff, changeStand,
      authError, confirmPending,
    }}>
      {children}
    </GameContext.Provider>
  );
}
