'use client';

/* ============================================================
   Presentation · ChromeShell
   Always-on chrome wrapper: stars, sound toggle, language
   toggle, toast host, and tweaks panel.  Appbar + tabbar live
   in (game)/layout.tsx since they only appear for in-app routes.
   ============================================================ */

import { Stars } from './ui-kit';
import { ToastHost } from '../feedback/toast';
import { TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakButton } from './tweaks-panel';
import { useGame } from '../state/game-provider';
import { T } from '../../domain/i18n';
import { clear } from '../../infrastructure/local-storage-game-repository';

export default function ChromeShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, scanlines, heroLayout, soundOn, setTweak } = useGame();
  const tx = (o: { es: string; en: string }) => o[lang];

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

      {children}

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
