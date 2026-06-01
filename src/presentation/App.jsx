'use client';

/* ============================================================
   Presentation · App shell (composition root)
   Wires use cases + storage + feedback to the routed screens.
   Holds UI state (route, player, progress) and translates use-case
   rewards into toasts/confetti. No business rules live here.
   ============================================================ */

import { useState, useEffect } from 'react';
import { T } from '../domain/i18n';
import { PIECES, standById, prizeById, decrementStock } from '../domain/catalog';
import { emptyProgress } from '../domain/progress';
import { badgeById } from '../domain/badges';
import { completeActivity } from '../application/complete-activity';
import { claimPrize } from '../application/claim-prize';
import { createPlayer } from '../application/create-player';
import { load, save, clear } from '../infrastructure/local-storage-game-repository';
import { Stars } from './components/ui-kit';
import { PixelSprite } from './components/sprites';
import { ToastHost, showToast } from './feedback/toast';
import { fireConfetti } from './feedback/confetti';
import { setSoundEnabled, primeAudio, playClick, playSuccess, playUnlock, playPrize } from './feedback/sound';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakButton } from './components/tweaks-panel';
import { Landing, Register } from './screens/onboard';
import { MapScreen, StandScreen, AvatarScreen } from './screens/core';
import { BadgesScreen, PrizesScreen, ScannerScreen, DashboardScreen } from './screens/meta';

const IN_APP = ['home', 'stand', 'avatar', 'badges', 'prizes'];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "es",
  "heroLayout": "center",
  "scanlines": true,
  "sound": true
}/*EDITMODE-END*/;

export default function App() {
  const saved = load();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const lang = t.lang, scanlines = t.scanlines, heroLayout = t.heroLayout;
  const soundOn = t.sound;
  const setLang = l => setTweak('lang', l);
  const [player, setPlayer] = useState(saved?.player || null);
  const [progress, setProgress] = useState(saved?.progress || emptyProgress());
  const [route, setRoute] = useState({ screen: 'landing', params: {} });
  const tx = o => o[lang];

  // persist game state (settings live in the tweaks store)
  useEffect(() => {
    save({ player, progress });
  }, [player, progress]);

  // keep the sound engine in sync with the tweak
  useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);

  // blip on any button press (delegated: one listener covers every button)
  useEffect(() => {
    function onClickSound(e) {
      primeAudio();
      const btn = e.target.closest ? e.target.closest('button') : null;
      if (btn && !btn.disabled) playClick();
    }
    document.addEventListener('click', onClickSound);
    return () => document.removeEventListener('click', onClickSound);
  }, []);

  // expose hooks for verifier / host
  useEffect(() => {
    window.__quest = {
      nav, setTweak, setLang,
      reset() { clear(); location.reload(); },
    };
  });

  function nav(screen, params = {}) {
    if (IN_APP.includes(screen) && !player) { setRoute({ screen: 'register', params: {} }); return; }
    setRoute({ screen, params });
    const sc = document.querySelector('.screen'); if (sc) sc.scrollTop = 0;
  }

  function onCreate({ name, baseId }) {
    const p = createPlayer({ name, baseId });
    setPlayer(p);
    setRoute({ screen: 'home', params: {} });
    setTimeout(() => { fireConfetti({ count: 80 }); showToast({ title: tx(T('¡Bienvenido!', 'Welcome!')), sub: p.name, sprite: 'flag' }); }, 250);
  }

  /* core action: validate an activity (use case + UI feedback) */
  function complete(standId, actId) {
    const { progress: np, rewards } = completeActivity(progress, standId, actId);
    if (!rewards) return { tickets: 0 };
    setProgress(np);

    // feedback
    const act = standById(standId).activities.find(a => a.id === actId);
    showToast({ title: '+' + rewards.tickets + ' ' + tx(T('TICKETS', 'TICKETS')), sub: tx(act.name), sprite: 'ticket' });
    if (rewards.piece) showToast({ title: tx(T('¡Pieza nueva!', 'New piece!')), sub: tx(PIECES[rewards.piece].name), sprite: PIECES[rewards.piece].sprite, dur: 3200 });
    rewards.badges.forEach(bid => { const b = badgeById(bid); showToast({ title: tx(T('¡Insignia!', 'Badge!')), sub: tx(b.name), sprite: b.icon, dur: 3200 }); });
    if (!rewards.piece && !rewards.badges.length) fireConfetti({ count: 40, y: .5 });
    if (rewards.piece) playUnlock(); else playSuccess();

    return { tickets: rewards.tickets, piece: rewards.piece, badges: rewards.badges };
  }

  function claim(prizeId) {
    const pz = prizeById(prizeId);
    const { progress: np, ok } = claimPrize(progress, pz);
    if (!ok) return;
    decrementStock(prizeId);
    setProgress(np);
    fireConfetti({ count: 90, colors: ['#ffd23f', '#ff9900', '#fff'] });
    showToast({ title: pz.raffle ? tx(T('¡Inscrito al sorteo!', 'Entered raffle!')) : tx(T('¡Premio canjeado!', 'Prize claimed!')), sub: tx(pz.name), sprite: pz.sprite, dur: 3000 });
    playPrize();
  }

  const actions = { complete, claim };
  const showChrome = IN_APP.includes(route.screen);

  // tab config
  const tabs = [
    { id: 'home', ic: 'ic_compass', label: T('Mapa', 'Map') },
    { id: 'avatar', ic: 'buddy', label: T('Avatar', 'Avatar') },
    { id: 'badges', ic: 'ic_medal', label: T('Insignias', 'Badges') },
    { id: 'prizes', ic: 'ticket', label: T('Premios', 'Prizes') },
  ];

  let view;
  const k = route.screen;
  if (k === 'landing') view = <Landing lang={lang} nav={nav} layout={heroLayout} />;
  else if (k === 'register') view = <Register lang={lang} nav={nav} onCreate={onCreate} />;
  else if (k === 'home') view = <MapScreen lang={lang} nav={nav} progress={progress} player={player} />;
  else if (k === 'stand') view = <StandScreen lang={lang} nav={nav} standId={route.params.standId} progress={progress} actions={actions} player={player} />;
  else if (k === 'avatar') view = <AvatarScreen lang={lang} nav={nav} progress={progress} player={player} />;
  else if (k === 'badges') view = <BadgesScreen lang={lang} progress={progress} />;
  else if (k === 'prizes') view = <PrizesScreen lang={lang} progress={progress} actions={actions} />;
  else if (k === 'scanner') view = <ScannerScreen lang={lang} nav={nav} progress={progress} actions={actions} player={player || { name: 'Demo', baseId: 'explorer' }} />;
  else if (k === 'dashboard') view = <DashboardScreen lang={lang} nav={nav} progress={progress} />;

  return (
    <div className={'stage ' + (scanlines ? 'scanlines' : 'scanlines off')}>
      <Stars />

      {/* sound on/off (usable in production, unlike the Tweaks panel) */}
      <button onClick={() => setTweak('sound', !soundOn)} className="pixel"
        aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
        style={{ position: 'fixed', top: 12, right: 76, zIndex: 60, fontSize: 11, padding: '6px 9px', cursor: 'pointer', border: '2px solid var(--line)', background: 'rgba(19,26,43,.9)', color: soundOn ? 'var(--orange)' : 'var(--ink-3)' }}>
        {soundOn ? '🔊' : '🔇'}
      </button>

      {/* global language toggle */}
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 60, display: 'flex', gap: 0, border: '2px solid var(--line)', background: 'rgba(19,26,43,.9)' }}>
        {['es', 'en'].map(l => (
          <button key={l} onClick={() => setLang(l)} className="pixel"
            style={{ fontSize: 9, padding: '7px 9px', cursor: 'pointer', border: 0, background: lang === l ? 'var(--orange)' : 'transparent', color: lang === l ? 'var(--ink-on-orange)' : 'var(--ink-3)' }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {showChrome && (
        <div className="appbar">
          <div className="brand" style={{ cursor: 'pointer' }} onClick={() => nav('home')}>
            <PixelSprite layers={['ic_cloud']} scale={1.6} /> CLOUD<b>QUEST</b>
          </div>
          <div className="coin" style={{ fontSize: 11, marginRight: 116 }}>
            <PixelSprite layers={['ticket']} scale={1.8} /> {progress.tickets}
          </div>
        </div>
      )}

      {/* routed screen (keyed for transition) */}
      <div key={k + JSON.stringify(route.params)} style={{ position: 'absolute', inset: 0, top: showChrome ? 56 : 0, bottom: showChrome ? 64 : 0 }}>
        {view}
      </div>

      {showChrome && (
        <div className="tabbar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}>
          {tabs.map(t => {
            const on = route.screen === t.id;
            return (
              <button key={t.id} className={'tab' + (on ? ' on' : '')} onClick={() => nav(t.id)}>
                <span className="ic" style={{ opacity: on ? 1 : .6 }}><PixelSprite layers={[t.ic]} scale={1.5} /></span>
                {tx(t.label)}
              </button>
            );
          })}
        </div>
      )}

      <ToastHost />

      <TweaksPanel title="Tweaks">
        <TweakSection label={tx(T('Idioma', 'Language'))} />
        <TweakRadio label={tx(T('Idioma', 'Language'))} value={lang}
          options={['es', 'en']} onChange={v => setTweak('lang', v)} />
        <TweakSection label={tx(T('Inicio', 'Landing'))} />
        <TweakRadio label={tx(T('Estilo', 'Style'))} value={heroLayout}
          options={['center', 'cabinet', 'split']} onChange={v => setTweak('heroLayout', v)} />
        <TweakSection label={tx(T('Pantalla', 'Screen'))} />
        <TweakToggle label={tx(T('Scanlines CRT', 'CRT scanlines'))} value={scanlines}
          onChange={v => setTweak('scanlines', v)} />
        <TweakSection label={tx(T('Sonido', 'Sound'))} />
        <TweakToggle label={tx(T('Efectos de sonido', 'Sound effects'))} value={soundOn}
          onChange={v => setTweak('sound', v)} />
        <TweakSection label={tx(T('Datos', 'Data'))} />
        <TweakButton label={tx(T('Reiniciar mi progreso', 'Reset my progress'))}
          onClick={() => { clear(); location.reload(); }} />
      </TweaksPanel>
    </div>
  );
}
