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
import { STANDS, PRIZES } from '../../domain/catalog';
import { loadCatalog } from '../../infrastructure/supabase-catalog-repository';
import { emptyProgress, deriveVisitedStands } from '../../domain/progress';
import { load, save, clear } from '../../infrastructure/local-storage-game-repository';
import { getSupabase, supabaseConfigured } from '../../infrastructure/supabase-client';
import { fetchProfile } from '../../infrastructure/supabase-game-repository';
import {
  fetchMyAssignments,
  approveCompletion as approveCompletionRpc,
  type StaffAssignment,
  type ApproveResult,
} from '../../infrastructure/supabase-staff-repository';
import { joinEvent, fetchParticipation } from '../../infrastructure/supabase-participation-repository';
import { claimPrize as claimPrizeRpc, PrizeClaimError, type ClaimFailureReason } from '../../infrastructure/supabase-prize-repository';
import { fetchActiveEvents, type ActiveEvent } from '../../infrastructure/supabase-events-repository';
import { showToast } from '../feedback/toast';
import { fireConfetti } from '../feedback/confetti';
import { setSoundEnabled, primeAudio, playClick, playPrize } from '../feedback/sound';
import { useTweaks } from '../components/tweaks-panel';
import type { Lang, Progress, Player, Localized, Actions, Nav, Stand, Prize } from '../../domain/types';

// Screens that require a logged-in player
const IN_APP = ['home', 'stand', 'avatar', 'badges', 'prizes', 'leaderboard'];

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
  leaderboard: '/leaderboard',
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
  selectedEventId: string | null;
  stands: Stand[];
  prizes: Prize[];
  catalogLoading: boolean;
  standById: (id: string) => Stand | undefined;
  prizeById: (id: string) => Prize | undefined;
  signUp: (p: { username: string; email: string; password: string; baseId: string }) => Promise<void>;
  signIn: (p: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  getStaffAssignments: () => Promise<StaffAssignment[]>;
  approveCompletion: (qrToken: string, activityId: string, position?: number) => Promise<ApproveResult>;
  authError: string | null;
  authLoading: boolean;
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

  // Per-event selection (SP1 Slice 5). One active event → auto-selected; several
  // active events → the player picks one (each selection joins it). The selected
  // event scopes the participation that progress is read from and written to.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([]);

  // Event catalog (stands + prizes) read from the DB for the active event, with
  // a static fallback. `catalog` is null until the first load resolves.
  const [catalog, setCatalog] = useState<{ stands: Stand[]; prizes: Prize[] } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Resolved catalog views: DB-backed when loaded, static otherwise. Lookups are
  // context-aware so consumers never import the static helpers for runtime data.
  const stands = catalog?.stands ?? STANDS;
  const prizes = catalog?.prizes ?? PRIZES;
  const standById = (id: string): Stand | undefined => stands.find(s => s.id === id);
  const prizeById = (id: string): Prize | undefined => prizes.find(p => p.id === id);

  // Stable ref to the selected event so async flows (claim refresh) read the
  // freshest event without re-creating their closures.
  const selectedEventIdRef = useRef<string | null>(selectedEventId);
  selectedEventIdRef.current = selectedEventId;
  // Catalog ref so async join/load can derive visitedStands against the freshest
  // stands without re-creating the closure on every catalog change.
  const standsRef = useRef<Stand[]>(stands);
  standsRef.current = stands;
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
        try {
          await loadProfile(s);
        } catch (err) {
          console.error('[loadProfile] failed:', err);
        } finally {
          setAuthLoading(false);
        }
      } else {
        setPlayer(null);
        setProgress(emptyProgress());
        setSelectedEventId(null);
        setActiveEvents([]);
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
      setPlayer({ name: profile.username, baseId: profile.baseId, role: profile.role, qrToken: profile.qrToken });

      // Resolve joinable events. Exactly one → auto-select & join (single-event
      // feel). Several → keep them and let the player pick (each pick joins).
      const events = await fetchActiveEvents(supabase);
      setActiveEvents(events);
      if (events.length === 1) {
        await joinAndLoad(events[0].id);
      } else if (events.length === 0) {
        setProgress(emptyProgress());
      }
    } finally {
      loadingForRef.current = null;
    }
  }

  // Join an event (idempotent RPC) and load its participation into state.
  // Participations are server-authoritative: the client only READS them (here on
  // join and after a claim). There is no client write path anymore — gameplay
  // rewards are awarded exclusively by the staff-scan approve_completion RPC, so
  // the old localStorage → participation upload migration is gone.
  async function joinAndLoad(eventId: string) {
    if (!supabase) return;
    const participation = await joinEvent(supabase, eventId);

    // visitedStands is derived (not stored); rebuild it from the current catalog.
    const withVisited: Progress = {
      ...participation.progress,
      visitedStands: deriveVisitedStands(participation.progress.doneActivities, standsRef.current),
    };
    setSelectedEventId(eventId);
    setProgress(withVisited);
  }

  // Player picks an event from the multi-event picker → join and load it. A join
  // failure (network / RPC) must not crash the picker: surface a toast and let
  // the player retry by tapping another event.
  async function selectEvent(eventId: string) {
    if (!supabase) return;
    try {
      await joinAndLoad(eventId);
    } catch (err) {
      console.error('[selectEvent] join failed:', err);
      showToast({
        title: tx(T('Error al unirse al evento', 'Could not join the event')),
        sprite: 'flag',
      });
    }
  }

  // Re-derive visitedStands whenever the catalog changes (e.g. static → DB
  // stands resolve after participation already loaded). Idempotent; the no-op
  // guard prevents a render loop.
  useEffect(() => {
    setProgress(prev => {
      const derived = deriveVisitedStands(prev.doneActivities, stands);
      const same =
        derived.length === prev.visitedStands.length &&
        derived.every(id => prev.visitedStands.includes(id));
      return same ? prev : { ...prev, visitedStands: derived };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stands]);

  // localStorage fallback: persist when Supabase not configured
  useEffect(() => {
    if (!supabase && !authLoading) save({ player, progress });
  }, [player, progress, authLoading, supabase]);

  // Load the event catalog. Offline (no Supabase) → static catalog immediately.
  // Online → catalog reads are RLS-gated to authenticated, so wait for a session,
  // then load from the DB and fall back to static on any error.
  useEffect(() => {
    let active = true;
    async function run() {
      if (!supabase) {
        const data = await loadCatalog(null);
        if (active) { setCatalog(data); setCatalogLoading(false); }
        return;
      }
      if (!session) return; // wait until authenticated before reading the catalog
      setCatalogLoading(true);
      try {
        const data = await loadCatalog(supabase);
        if (active) { setCatalog(data); setCatalogLoading(false); }
      } catch (err) {
        console.warn('[loadCatalog] DB read failed; using static catalog:', err);
        if (active) { setCatalog({ stands: STANDS, prizes: PRIZES }); setCatalogLoading(false); }
      }
    }
    run();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session]);

  // ── Realtime live-refresh (SP3 polish) ──────────────────────────────────────
  // After a staff scan credits the player, approve_completion mutates the
  // player's participations row server-side. Without this, the player's screen
  // shows stale tickets / badges / pieces / done_activities until a manual
  // reload. Subscribe to postgres_changes on the player's own row and refetch
  // the authoritative participation on any change so state reflects the credit
  // live. RLS scopes delivery to the owner (participations_select_own); the
  // player_id filter narrows it client-side too. Offline (no Supabase) skips
  // this entirely. The effect re-subscribes on event change and tears down on
  // unmount / signOut (session → null), so no channel subscription leaks.
  useEffect(() => {
    if (!supabase || !session || !selectedEventId) return;
    const sb = supabase;
    const eventId = selectedEventId;
    const playerId = session.user.id;

    async function refresh() {
      try {
        const participation = await fetchParticipation(sb, eventId);
        if (!participation) return;
        setProgress({
          ...participation.progress,
          visitedStands: deriveVisitedStands(participation.progress.doneActivities, standsRef.current),
        });
      } catch (err) {
        console.warn('[realtime] participation refetch failed:', err);
      }
    }

    const channel = sb
      .channel(`participation:${playerId}:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participations', filter: `player_id=eq.${playerId}` },
        () => { void refresh(); },
      )
      .subscribe();

    return () => { void sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session, selectedEventId]);

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
    // Participations are server-authoritative (no client write-behind to flush);
    // just clear local state and end the session.
    setConfirmPending(false);
    setAuthError(null);
    clear();
    await supabase.auth.signOut();
    // onAuthStateChange null branch will clear player/progress
    router.push('/');
  }

  // ── Staff scan (SP3) ────────────────────────────────────────────────────────
  // Staff are admin-assigned (SP2); there is no self-enrollment. These helpers
  // bind the authenticated client to the staff-scan repository so the staff
  // screen owns its own loading/scan state without holding it in the provider.

  async function getStaffAssignments(): Promise<StaffAssignment[]> {
    if (!supabase || !session) return [];
    return fetchMyAssignments(supabase);
  }

  async function approveCompletion(
    qrToken: string,
    activityId: string,
    position?: number,
  ): Promise<ApproveResult> {
    if (!supabase || !session) {
      throw new Error('Not authenticated');
    }
    return approveCompletionRpc(supabase, qrToken, activityId, position);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  // Claiming is server-authoritative (SP3): the claim_prize RPC validates
  // affordability / stock / duplication and atomically deducts tickets, records
  // the claim, and decrements stock. The client no longer mutates participation
  // for a claim — it refreshes participation + catalog from the DB so the UI
  // reflects the authoritative result. Fire-and-forget from the button handler.
  function claim(prizeId: string): void {
    void claimFlow(prizeId);
  }

  function claimErrorTitle(reason: ClaimFailureReason): string {
    switch (reason) {
      case 'insufficient':
        return tx(T('No te alcanzan los tickets', 'Not enough tickets'));
      case 'out-of-stock':
        return tx(T('Premio sin stock', 'Prize out of stock'));
      case 'already-claimed':
        return tx(T('Ya canjeaste este premio', 'Prize already claimed'));
      default:
        return tx(T('No se pudo canjear el premio', 'Could not claim the prize'));
    }
  }

  async function claimFlow(prizeId: string): Promise<void> {
    if (!supabase) return;
    const eventId = selectedEventIdRef.current;
    if (!eventId) return;
    const pz = prizeById(prizeId);

    try {
      await claimPrizeRpc(supabase, eventId, prizeId);

      // Reload the authoritative participation (tickets / claimed) and catalog
      // (decremented stock) from the DB; derive visitedStands as elsewhere.
      const participation = await fetchParticipation(supabase, eventId);
      if (participation) {
        setProgress({
          ...participation.progress,
          visitedStands: deriveVisitedStands(participation.progress.doneActivities, standsRef.current),
        });
      }
      try {
        const data = await loadCatalog(supabase);
        setCatalog(data);
      } catch {
        // Keep the current catalog on a refresh failure; the claim still stuck.
      }

      if (pz) {
        fireConfetti({ count: 90, colors: ['#ffd23f', '#ff9900', '#fff'] });
        showToast({ title: pz.raffle ? tx(T('¡Inscrito al sorteo!', 'Entered raffle!')) : tx(T('¡Premio canjeado!', 'Prize claimed!')), sub: tx(pz.name), sprite: pz.sprite, dur: 3000 });
        playPrize();
      }
    } catch (err) {
      const reason = err instanceof PrizeClaimError ? err.reason : 'unknown';
      showToast({ title: claimErrorTitle(reason), sprite: 'flag' });
    }
  }

  const actions: Actions = { claim };

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

  // Multi-event gate (SP1 Slice 5): when more than one event is active and the
  // player has not picked one yet, show a minimal picker. With a single active
  // event this branch never renders (auto-selected during loadProfile).
  if (player && !selectedEventId && activeEvents.length > 1) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div className="pixel" style={{ fontSize: 12, color: 'var(--cyan)', letterSpacing: 2, marginBottom: 16, textAlign: 'center' }}>
            {tx(T('ELEGÍ UN EVENTO', 'CHOOSE AN EVENT'))}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {activeEvents.map(ev => (
              <button
                key={ev.id}
                type="button"
                onClick={() => { void selectEvent(ev.id); }}
                className="t"
                style={{
                  width: '100%', textAlign: 'left', padding: '14px 16px',
                  background: 'var(--surface, #1b1b22)', color: 'var(--ink)',
                  border: '1px solid var(--line, #333)', borderRadius: 10, cursor: 'pointer',
                }}
              >
                {ev.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <GameContext.Provider value={{
      lang, setLang, heroLayout, scanlines, soundOn, setTweak,
      player, progress, actions, nav, selectedEventId,
      stands, prizes, catalogLoading, standById, prizeById,
      signUp, signIn, signOut, getStaffAssignments, approveCompletion,
      authError, authLoading, confirmPending,
    }}>
      {children}
    </GameContext.Provider>
  );
}
