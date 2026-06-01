'use client';

/* ============================================================
   Presentation · Onboarding screens — Landing + Register
   ============================================================ */

import { useState } from 'react';
import { T } from '../../domain/i18n';
import { PIECES } from '../../domain/catalog';
import { Btn, Card } from '../components/ui-kit';
import { PixelSprite, AVATAR_BASES } from '../components/sprites';
import { Avatar, AvatarStage } from '../components/avatar';

/* ---------------- LANDING ---------------- */
export function Landing({ lang, nav, layout = 'center' }) {
  const tx = o => o[lang];
  const floatPieces = ['cap', 'visor', 'shield', 'backpack', 'boots'];

  const Title = (
    <div>
      <div className="eyebrow">AWS COMMUNITY DAY · 2026</div>
      <h1 className="pixel glow" style={{ fontSize: 'clamp(30px,7vw,64px)', color: 'var(--ink)', margin: '10px 0 0', lineHeight: 1.2 }}>
        CLOUD<br /><span style={{ color: 'var(--orange)' }}>QUEST</span>
      </h1>
      <p className="t lg" style={{ maxWidth: 440, marginTop: 16 }}>
        {tx(T('Recorre el evento, completa retos en cada stand y arma tu avatar pixel pieza por pieza.',
              'Roam the event, clear challenges at every stand and build your pixel avatar piece by piece.'))}
      </p>
      <div className="row wrap" style={{ marginTop: 26 }}>
        <Btn variant="" size="lg" onClick={() => nav('register')}>▶ {tx(T('Comenzar', 'Start'))}</Btn>
        <Btn variant="ghost" size="lg" onClick={() => nav('scanner')}>{tx(T('Soy staff', 'I am staff'))}</Btn>
      </div>
      <button className="kbtn" style={{ marginTop: 14 }} onClick={() => nav('dashboard')}>
        ⚙ {tx(T('Panel del organizador', 'Organizer panel'))} →
      </button>
    </div>
  );

  const Hero = (
    <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 230 }}>
      {/* floating pieces orbit */}
      {floatPieces.map((id, i) => {
        const ang = (i / floatPieces.length) * Math.PI * 2 - Math.PI / 2;
        const R = 112;
        return (
          <div key={id} className={i % 2 ? 'bob' : 'bob2'} style={{
            position: 'absolute',
            left: `calc(50% + ${Math.cos(ang) * R}px)`,
            top: `calc(50% + ${Math.sin(ang) * R * .5}px)`,
            transform: 'translate(-50%,-50%)', opacity: .9,
            animationDelay: (i * .3) + 's',
          }}>
            <Card flat style={{ padding: 7, background: 'var(--panel-2)', borderColor: 'var(--line)' }}>
              <PixelSprite layers={[PIECES[id].sprite]} scale={3} />
            </Card>
          </div>
        );
      })}
      <AvatarStage baseId="explorer" pieces={['cap', 'visor']} scale={9} />
    </div>
  );

  const stats = [
    T('5 zonas', '5 zones'), T('5 piezas', '5 pieces'),
    T('insignias', 'badges'), T('premios', 'prizes'),
  ];

  let body;
  if (layout === 'split') {
    body = (
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'center', gap: 30 }}>
        <div>{Title}</div>{Hero}
      </div>
    );
  } else if (layout === 'cabinet') {
    body = (
      <Card raise corners style={{ maxWidth: 720, margin: '0 auto', background: 'var(--bg-2)', padding: 28 }}>
        <div className="center-txt">{Hero}</div>
        <div className="center-txt" style={{ marginTop: 8 }}>{Title}</div>
      </Card>
    );
  } else {
    body = (<div className="center-txt" style={{ maxWidth: 560, margin: '0 auto' }}>{Hero}<div style={{ marginTop: 8 }}>{Title}</div></div>);
  }

  return (
    <div className="screen scr-anim">
      <div className="wrap" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minHeight: '100%', paddingTop: 92 }}>
        {layout === 'cabinet' && (
          <style>{`.scr-anim .center-txt .row{justify-content:center}.scr-anim .center-txt .eyebrow,.scr-anim .center-txt .t{margin-left:auto;margin-right:auto}`}</style>
        )}
        {body}
        <div className="row wrap" style={{ justifyContent: layout === 'split' ? 'flex-start' : 'center', marginTop: 34, gap: 8 }}>
          {stats.map((s, i) => <span key={i} className="chip"><span className="dot" style={{ background: ['var(--orange)', 'var(--cyan)', 'var(--green)', 'var(--pink)'][i] }}></span>{tx(s)}</span>)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- REGISTER ---------------- */
export function Register({ lang, nav, onCreate }) {
  const tx = o => o[lang];
  const [name, setName] = useState('');
  const [baseId, setBaseId] = useState('explorer');
  const valid = name.trim().length >= 2;

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 40 }}>
        <button className="kbtn" onClick={() => nav('landing')}>← {tx(T('Volver', 'Back'))}</button>
        <div className="eyebrow mt10">{tx(T('Crea tu jugador', 'Create your player'))}</div>
        <h2 className="h1" style={{ marginTop: 8 }}>{tx(T('¿Quién entra a la party?', 'Who joins the party?'))}</h2>

        {/* live preview */}
        <Card corners raise className="mt20" style={{ display: 'grid', placeItems: 'center', padding: 22, background: 'var(--bg-2)' }}>
          <AvatarStage baseId={baseId} pieces={[]} scale={9} />
          <div className="pixel" style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 6 }}>
            {name.trim() ? name.trim().toUpperCase() : tx(T('SIN NOMBRE', 'NO NAME'))}
          </div>
        </Card>

        {/* name */}
        <div className="mt20">
          <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tx(T('TU NOMBRE', 'YOUR NAME'))}</label>
          <input value={name} maxLength={14} onChange={e => setName(e.target.value)}
            placeholder={tx(T('p. ej. Lupita', 'e.g. Sam'))}
            style={{
              width: '100%', marginTop: 8, padding: '14px 14px', background: 'var(--panel)',
              border: '3px solid var(--line)', color: 'var(--ink)', fontFamily: 'var(--fontBody)',
              fontSize: 24, outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--orange)'}
            onBlur={e => e.target.style.borderColor = 'var(--line)'} />
        </div>

        {/* avatar choice */}
        <div className="pixel mt20" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tx(T('ELIGE TU AVATAR', 'PICK YOUR AVATAR'))}</div>
        <div className="grid mt10" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {AVATAR_BASES.map(b => (
            <button key={b.id} onClick={() => setBaseId(b.id)} className="clickable"
              style={{
                background: baseId === b.id ? 'var(--panel-hi)' : 'var(--panel)',
                border: '3px solid ' + (baseId === b.id ? 'var(--orange)' : 'var(--line)'),
                padding: '10px 4px 8px', cursor: 'pointer', display: 'grid', placeItems: 'center', gap: 4,
              }}>
              <Avatar baseId={b.id} pieces={[]} scale={4} />
              <span className="pixel" style={{ fontSize: 7, color: baseId === b.id ? 'var(--orange)' : 'var(--ink-3)' }}>{b.name}</span>
            </button>
          ))}
        </div>

        <Btn block size="lg" className="mt28" disabled={!valid}
          onClick={() => { onCreate({ name: name.trim(), baseId }); }}>
          {tx(T('Crear y entrar', 'Create & enter'))} ▶
        </Btn>
      </div>
    </div>
  );
}
