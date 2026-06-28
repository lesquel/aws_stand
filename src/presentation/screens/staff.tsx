'use client';

/* ============================================================
   Presentation · Staff screen — enrollment + console
   Two views:
   - Enrollment: authenticated player enters access code + picks
     stand; name/avatar come from the DB account (read-only).
   - Console: shows the stand's staffCode big, lists activities,
     and gives instructions for validating on the player's phone.
   ============================================================ */

import { useState } from 'react';
import { T } from '../../domain/i18n';
import { STANDS } from '../../domain/catalog';
import { Btn, Card } from '../components/ui-kit';
import { PixelSprite } from '../components/sprites';
import { Avatar, AvatarStage } from '../components/avatar';
import type { Lang, Nav, Localized, Player } from '../../domain/types';

interface StaffScreenProps {
  lang: Lang;
  nav: Nav;
  player: Player | null;
  becomeStaff: (standId: string, accessCode: string) => Promise<{ ok: boolean; error?: string }>;
  changeStand: (standId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function StaffScreen({ lang, nav, player, becomeStaff, changeStand }: StaffScreenProps) {
  const [changingStand, setChangingStand] = useState(false);

  // If already registered as staff and not actively changing stand, show the console
  if (player?.role === 'staff' && !changingStand) {
    return (
      <StaffConsole
        lang={lang}
        nav={nav}
        player={player}
        onChangeStand={() => setChangingStand(true)}
      />
    );
  }

  return (
    <StaffEnrollment
      lang={lang}
      nav={nav}
      player={player}
      isChangingStand={player?.role === 'staff'}
      onDone={() => setChangingStand(false)}
      becomeStaff={becomeStaff}
      changeStand={changeStand}
    />
  );
}

/* ── Enrollment ─────────────────────────────────────────────────────────────── */

interface StaffEnrollmentProps {
  lang: Lang;
  nav: Nav;
  player: Player | null;
  isChangingStand: boolean | undefined;
  onDone: () => void;
  becomeStaff: (standId: string, accessCode: string) => Promise<{ ok: boolean; error?: string }>;
  changeStand: (standId: string) => Promise<{ ok: boolean; error?: string }>;
}

function StaffEnrollment({ lang, nav, player, isChangingStand, onDone, becomeStaff, changeStand }: StaffEnrollmentProps) {
  const tx = (o: Localized) => o[lang];

  const [standId, setStandId] = useState(player?.standId ?? '');
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Stand change skips access code — the change_stand RPC enforces the role check server-side
  const valid = standId !== '' && (isChangingStand || accessCode.length === 4);

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setAccessCodeError(null);
    try {
      if (isChangingStand) {
        const result = await changeStand(standId);
        if (!result.ok) {
          setAccessCodeError(result.error ?? tx(T('Error al cambiar el stand', 'Error changing stand')));
        } else {
          onDone();
        }
      } else {
        const result = await becomeStaff(standId, accessCode);
        if (!result.ok) {
          setAccessCodeError(result.error ?? tx(T('Código de acceso incorrecto', 'Wrong access code')));
        }
        // On success, becomeStaff already routes to /staff
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 30 }}>
        <button className="kbtn" onClick={() => nav('landing')}>← {tx(T('Volver', 'Back'))}</button>
        <div className="eyebrow mt10" style={{ color: 'var(--cyan)' }}>
          {isChangingStand ? tx(T('CAMBIAR STAND', 'CHANGE STAND')) : tx(T('REGISTRO STAFF', 'STAFF REGISTRATION'))}
        </div>
        <h2 className="h1" style={{ marginTop: 8 }}>
          {isChangingStand ? tx(T('Selecciona tu stand', 'Select your stand')) : tx(T('Acceso para encargados', 'Staff access'))}
        </h2>

        {/* Read-only account header */}
        {player && (
          <Card corners raise className="mt20" style={{ display: 'grid', placeItems: 'center', padding: 22, background: 'var(--bg-2)' }}>
            <AvatarStage baseId={player.baseId} pieces={[]} scale={9} />
            <div className="pixel" style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 6 }}>
              {player.name.toUpperCase()}
            </div>
          </Card>
        )}

        {/* Access code — only for first-time enrollment; stand change skips it */}
        {!isChangingStand && (
          <div className="mt20">
            <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tx(T('CÓDIGO DE ACCESO STAFF', 'STAFF ACCESS CODE'))}</label>
            <input
              value={accessCode}
              maxLength={4}
              inputMode="numeric"
              onChange={e => { setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setAccessCodeError(null); }}
              placeholder="0000"
              style={{
                width: '100%', marginTop: 8, padding: '14px 14px', background: 'var(--panel)',
                border: '3px solid ' + (accessCodeError ? 'var(--red, #ff4c4c)' : 'var(--line)'),
                color: 'var(--ink)', fontFamily: 'var(--fontPixel)', fontSize: 24,
                outline: 'none', textAlign: 'center', letterSpacing: 8,
              }}
              onFocus={e => { if (!accessCodeError) e.target.style.borderColor = 'var(--cyan)'; }}
              onBlur={e => { if (!accessCodeError) e.target.style.borderColor = 'var(--line)'; }}
            />
            {accessCodeError && (
              <div className="pixel mt6" style={{ fontSize: 9, color: 'var(--red, #ff4c4c)' }}>
                {accessCodeError}
              </div>
            )}
          </div>
        )}

        {/* Stand selector */}
        <div className="pixel mt20" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tx(T('ELIGE TU STAND', 'SELECT YOUR STAND'))}</div>
        <div className="col mt10" style={{ gap: 8 }}>
          {STANDS.map(s => (
            <button key={s.id} onClick={() => setStandId(s.id)} className="clickable"
              style={{
                background: standId === s.id ? 'var(--panel-hi)' : 'var(--panel)',
                border: '3px solid ' + (standId === s.id ? s.accent : 'var(--line)'),
                padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                textAlign: 'left',
              }}>
              <PixelSprite layers={[s.icon]} scale={2} />
              <span className="pixel" style={{ fontSize: 10, color: standId === s.id ? s.accent : 'var(--ink-2)' }}>
                {tx(s.name)}
              </span>
            </button>
          ))}
        </div>

        {/* Inline error for stand change */}
        {isChangingStand && accessCodeError && (
          <div className="pixel mt10" style={{ fontSize: 9, color: 'var(--red, #ff4c4c)' }}>
            {accessCodeError}
          </div>
        )}

        <Btn block size="lg" className="mt28" disabled={!valid || submitting} onClick={submit}>
          {submitting
            ? tx(T('Verificando...', 'Verifying...'))
            : isChangingStand
              ? tx(T('Confirmar cambio', 'Confirm change')) + ' ▶'
              : tx(T('Entrar como staff', 'Enter as staff')) + ' ▶'}
        </Btn>
      </div>
    </div>
  );
}

/* ── Console ─────────────────────────────────────────────────────────────────── */

interface StaffConsoleProps {
  lang: Lang;
  nav: Nav;
  player: Player;
  onChangeStand: () => void;
}

function StaffConsole({ lang, nav, player, onChangeStand }: StaffConsoleProps) {
  const tx = (o: Localized) => o[lang];

  const stand = STANDS.find(s => s.id === player.standId);

  // Guard: if stand not found, prompt to re-register
  if (!stand) {
    return (
      <div className="screen scr-anim">
        <div className="wrap narrow" style={{ paddingTop: 30 }}>
          <p className="t center-txt">{tx(T('Stand no encontrado. Regístrate de nuevo.', 'Stand not found. Please re-register.'))}</p>
          <Btn block className="mt14" onClick={onChangeStand}>{tx(T('Registrarse', 'Register'))}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 30 }}>
        {/* staff header */}
        <div className="spread">
          <div className="row center" style={{ gap: 12 }}>
            <Card flat style={{ padding: 6, background: 'var(--panel-2)' }}>
              <Avatar baseId={player.baseId} pieces={[]} scale={3} />
            </Card>
            <div>
              <div className="pixel" style={{ fontSize: 8, color: 'var(--cyan)' }}>{tx(T('MODO STAFF', 'STAFF MODE'))}</div>
              <div className="pixel" style={{ fontSize: 13, color: 'var(--ink)' }}>{player.name.toUpperCase()}</div>
            </div>
          </div>
          <button className="kbtn" onClick={() => nav('landing')}>✕</button>
        </div>

        {/* stand badge */}
        <Card corners raise className="mt14" style={{ borderColor: stand.accent, background: 'var(--bg-2)', padding: 16 }}>
          <div className="row center" style={{ gap: 12 }}>
            <PixelSprite layers={[stand.icon]} scale={3} />
            <div className="f1">
              <div className="pixel" style={{ fontSize: 8, color: stand.accent }}>{tx(stand.tag)}</div>
              <div className="h2" style={{ marginTop: 4 }}>{tx(stand.name)}</div>
            </div>
          </div>
        </Card>

        {/* the staff code — displayed big */}
        <div className="mt20 center-txt">
          <div className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 10 }}>
            {tx(T('CÓDIGO DEL STAND', 'STAND CODE'))}
          </div>
          <Card corners raise style={{
            display: 'inline-block', padding: '18px 36px',
            background: 'var(--panel)', borderColor: stand.accent,
            boxShadow: `0 0 24px ${stand.accent}44`,
          }}>
            <div className="pixel" style={{ fontSize: 52, color: stand.accent, letterSpacing: 12 }}>
              {stand.staffCode}
            </div>
          </Card>
        </div>

        {/* instructions */}
        <Card flat className="mt20" style={{ padding: 14, borderColor: 'var(--cyan)', background: 'var(--panel-2)' }}>
          <div className="pixel" style={{ fontSize: 9, color: 'var(--cyan)', marginBottom: 8 }}>
            {tx(T('INSTRUCCIONES', 'INSTRUCTIONS'))}
          </div>
          <p className="t sm">
            {tx(T(
              'Cuando un jugador complete una actividad, ingresa este código en SU teléfono.',
              'When a player completes an activity, enter this code on THEIR phone.'
            ))}
          </p>
        </Card>

        {/* activities reference */}
        <div className="eyebrow mt20" style={{ marginBottom: 10 }}>{tx(T('Actividades del stand', 'Stand activities'))}</div>
        <div className="col" style={{ gap: 8 }}>
          {stand.activities.map(act => (
            <Card key={act.id} flat style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="f1 t" style={{ color: 'var(--ink)' }}>{tx(act.name)}</div>
              <div className="coin" style={{ fontSize: 9 }}>
                <PixelSprite layers={['ticket']} scale={1.4} /> +{act.tickets}
              </div>
            </Card>
          ))}
        </div>

        <Btn block size="sm" className="mt20" onClick={() => nav('leaderboard')}>
          {tx(T('Ver ranking', 'View leaderboard'))}
        </Btn>

        <Btn block variant="ghost" size="sm" className="mt14" onClick={onChangeStand}>
          {tx(T('Cambiar stand', 'Change stand'))}
        </Btn>
      </div>
    </div>
  );
}
