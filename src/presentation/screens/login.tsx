'use client';

/* ============================================================
   Presentation · Login screen
   ============================================================ */

import { useState } from 'react';
import { T } from '../../domain/i18n';
import { Btn } from '../components/ui-kit';
import type { Lang, Nav, Localized } from '../../domain/types';

interface LoginProps {
  lang: Lang;
  nav: Nav;
  signIn: (p: { email: string; password: string }) => Promise<void>;
  authError: string | null;
}

export function Login({ lang, nav, signIn, authError }: LoginProps) {
  const tx = (o: Localized) => o[lang];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const valid = email.includes('@') && password.length >= 6;

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    await signIn({ email, password });
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', marginTop: 8, padding: '14px 14px',
    background: 'var(--panel)', border: '3px solid var(--line)',
    color: 'var(--ink)', fontFamily: 'var(--fontBody)', fontSize: 20,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 40 }}>
        <button className="kbtn" onClick={() => nav('landing')}>← {tx(T('Volver', 'Back'))}</button>
        <div className="eyebrow mt10">{tx(T('Entrar', 'Log in'))}</div>
        <h2 className="h1" style={{ marginTop: 8 }}>{tx(T('Bienvenido de nuevo', 'Welcome back'))}</h2>

        {authError && (
          <div className="pixel mt14" style={{
            fontSize: 9, color: 'var(--red, #ff4c4c)', padding: '10px 12px',
            background: 'var(--panel)', border: '2px solid var(--red, #ff4c4c)',
          }}>
            {authError}
          </div>
        )}

        <div className="mt20">
          <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>EMAIL</label>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = 'var(--orange)'}
            onBlur={e => e.target.style.borderColor = 'var(--line)'}
          />
        </div>

        <div className="mt14">
          <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
            {tx(T('CONTRASEÑA', 'PASSWORD'))}
          </label>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = 'var(--orange)'}
            onBlur={e => e.target.style.borderColor = 'var(--line)'}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
        </div>

        <Btn block size="lg" className="mt28" disabled={!valid || submitting} onClick={submit}>
          {submitting ? tx(T('Entrando...', 'Logging in...')) : tx(T('Entrar', 'Log in')) + ' ▶'}
        </Btn>

        <div className="center-txt mt20">
          <button className="kbtn" onClick={() => nav('register')}>
            {tx(T('Crear cuenta', 'Create account'))} →
          </button>
        </div>
      </div>
    </div>
  );
}
