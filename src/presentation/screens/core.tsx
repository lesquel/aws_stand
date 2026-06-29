'use client';

/* ============================================================
   Presentation · Core screens — Map (home), Stand, Avatar
   ============================================================ */

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { T } from '../../domain/i18n';
import { PIECES, PIECE_ORDER } from '../../domain/catalog';
import { standDoneOf, standProgressOf } from '../../domain/progress';
import { Card, Btn, Bar, Modal } from '../components/ui-kit';
import { PixelSprite } from '../components/sprites';
import { Avatar, AvatarStage } from '../components/avatar';
import { useGame } from '../state/game-provider';
import type { Lang, Nav, Progress, Player, Localized, PieceId } from '../../domain/types';

interface QrModalProps { lang: Lang; player: Player; onClose: () => void; }
/* shared: player QR modal — renders the participant's unique qr_token as a
   scannable QR (CA-02 / RN-01). The QR encodes the RAW token: the staff scanner
   reads exactly this string and feeds it to approve_completion. The token text
   is shown below so staff can type it manually if the camera is unavailable.
   Offline (localStorage fallback, no Supabase session) there is no token, so we
   show a sign-in note instead of a non-scannable placeholder. */
export function QrModal({ lang, player, onClose }: QrModalProps) {
  const tx = (o: Localized) => o[lang];
  const token = player.qrToken;
  return (
    <Modal onClose={onClose}>
      <Card corners raise style={{ background: 'var(--bg-2)', textAlign: 'center', padding: 24 }}>
        <div className="eyebrow">{tx(T('Tu código', 'Your code'))}</div>
        <h2 className="h2 mt6">{tx(T('Muéstralo al staff', 'Show it to staff'))}</h2>

        {token ? (
          <>
            <div style={{ display: 'grid', placeItems: 'center', marginTop: 16 }}>
              <div style={{ background: '#fff', padding: 12, border: '3px solid var(--orange)' }}>
                <QRCodeSVG value={token} size={184} level="M" bgColor="#ffffff" fgColor="#0d1322" />
              </div>
            </div>
            <div
              className="t sm"
              style={{
                marginTop: 14, fontFamily: 'var(--fontMono, monospace)', fontSize: 11,
                color: 'var(--orange)', wordBreak: 'break-all', userSelect: 'all',
                background: 'var(--panel)', border: '2px solid var(--line)', padding: '8px 10px',
              }}
            >
              {token}
            </div>
            <p className="t sm" style={{ marginTop: 8 }}>
              {tx(T('El staff escanea tu QR para validar. Si no hay cámara, puede ingresar el código.',
                    'Staff scans your QR to validate. If there is no camera, they can enter the code.'))}
            </p>
          </>
        ) : (
          <p className="t sm" style={{ marginTop: 18 }}>
            {tx(T('Tu código QR estará disponible al iniciar sesión.',
                  'Your QR code will be available once you sign in.'))}
          </p>
        )}

        <Btn block className="mt20" variant="ghost" onClick={onClose}>{tx(T('Cerrar', 'Close'))}</Btn>
      </Card>
    </Modal>
  );
}

interface MapScreenProps { lang: Lang; nav: Nav; progress: Progress; player: Player; }
/* ---------------- MAP / HOME ---------------- */
export function MapScreen({ lang, nav, progress, player }: MapScreenProps) {
  const tx = (o: Localized) => o[lang];
  const { signOut, stands, catalogLoading } = useGame();
  const [qr, setQr] = useState(false);
  const totalAct = stands.reduce((n, s) => n + s.activities.length, 0);
  const doneAct = progress.doneActivities.length;
  const firstIncomplete = stands.find(s => !standDoneOf(s, progress)) || stands[stands.length - 1];

  // polyline points (in % of the map box)
  const pts = stands.map(s => s.map);
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  // how many segments are "complete" (between consecutive done stands)
  const doneFlags = stands.map(s => standDoneOf(s, progress));

  // Block render until the catalog is loaded so the map never draws against an
  // empty/undefined stand set.
  if (catalogLoading) {
    return (
      <div className="screen scr-anim">
        <div className="wrap" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <div className="pixel" style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: 3 }}>
            {tx(T('CARGANDO MAPA...', 'LOADING MAP...'))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen scr-anim">
      <div className="wrap">
        {/* greeting */}
        <div className="spread" style={{ marginBottom: 6 }}>
          <div className="row center" style={{ gap: 12 }}>
            <Card flat style={{ padding: 6, background: 'var(--panel-2)' }}><Avatar baseId={player.baseId} pieces={progress.pieces} scale={3} /></Card>
            <div>
              <div className="t sm">{tx(T('Hola', 'Hi'))},</div>
              <div className="pixel" style={{ fontSize: 13, color: 'var(--ink)' }}>{(player.name || 'PLAYER').toUpperCase()}</div>
            </div>
          </div>
          <div className="row center" style={{ gap: 8 }}>
            <button className="clickable coin" onClick={() => nav('prizes')} style={{ background: 'var(--panel-2)', border: '2px solid var(--line)', padding: '8px 12px', cursor: 'pointer' }}>
              <PixelSprite layers={['ticket']} scale={2} /> {progress.tickets}
            </button>
            <button className="kbtn" onClick={() => signOut()} style={{ fontSize: 8, padding: '6px 8px' }}>
              {tx(T('Salir', 'Log out'))}
            </button>
          </div>
        </div>

        {/* overall progress */}
        <Card className="mt10" style={{ padding: 14 }}>
          <div className="spread" style={{ marginBottom: 8 }}>
            <span className="pixel" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{tx(T('PROGRESO DEL EVENTO', 'EVENT PROGRESS'))}</span>
            <span className="pixel" style={{ fontSize: 10, color: 'var(--orange)' }}>{doneAct}/{totalAct}</span>
          </div>
          <Bar value={doneAct} max={totalAct} segs={totalAct} orange />
        </Card>

        {/* the map */}
        <div className="eyebrow mt20" style={{ marginBottom: 10 }}>{tx(T('Mapa del evento — toca una zona', 'Event map — tap a zone'))}</div>
        <Card corners style={{ padding: 0, background: 'linear-gradient(180deg,#10182c,#0d1322)', overflow: 'hidden' }}>
          <div style={{ position: 'relative', width: '100%', paddingBottom: '92%', maxHeight: 560 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <polyline points={poly} fill="none" stroke="#28344c" strokeWidth="2.4" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={poly} fill="none" stroke="var(--orange)" strokeWidth="2.4"
                strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round"
                style={{ opacity: .9, animation: 'dash 22s linear infinite' }}
                pathLength="100" />
              <style>{`@keyframes dash{to{stroke-dashoffset:-140}}`}</style>
            </svg>
            {stands.map((s, i) => {
              const done = doneFlags[i];
              const prog = standProgressOf(s, progress);
              const isTarget = firstIncomplete && firstIncomplete.id === s.id;
              return (
                <button key={s.id} className="clickable" onClick={() => nav('stand', { standId: s.id })}
                  style={{
                    position: 'absolute', left: s.map.x + '%', top: s.map.y + '%',
                    transform: 'translate(-50%,-50%)', background: 'none', border: 0, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 2,
                  }}>
                  <div style={{
                    position: 'relative', display: 'grid', placeItems: 'center', padding: 8,
                    background: 'var(--panel)', border: '3px solid ' + s.accent,
                    boxShadow: isTarget ? '0 0 0 3px rgba(255,153,0,.25), 0 5px 0 rgba(0,0,0,.5)' : '0 5px 0 rgba(0,0,0,.5)',
                    clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px)',
                  }}>
                    <PixelSprite layers={[s.icon]} scale={2} />
                    {done && <div style={{ position: 'absolute', top: -10, right: -10 }}><PixelSprite layers={['flag']} scale={1.6} /></div>}
                    {isTarget && !done && <div className="bob" style={{ position: 'absolute', top: -34, left: '50%', transform: 'translateX(-50%)' }}><Avatar baseId={player.baseId} pieces={progress.pieces} scale={2} /></div>}
                  </div>
                  <span className="pixel" style={{ fontSize: 7, color: 'var(--ink-2)', background: 'rgba(13,19,34,.8)', padding: '3px 5px', whiteSpace: 'nowrap' }}>
                    {tx(s.name)}
                  </span>
                  <span className="pixel" style={{ fontSize: 6, color: done ? 'var(--green)' : s.accent }}>{done ? '✓ ' + tx(T('LISTO', 'DONE')) : prog.done + '/' + prog.total}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Btn block variant="ghost" className="mt20" onClick={() => setQr(true)}>
          {tx(T('Mostrar mi código QR', 'Show my QR code'))}
        </Btn>
      </div>
      {qr && <QrModal lang={lang} player={player} onClose={() => setQr(false)} />}
    </div>
  );
}

interface StandScreenProps { lang: Lang; nav: Nav; standId: string; progress: Progress; player: Player; }
/* ---------------- STAND ----------------
   Read-only for the player: activities are validated server-side by staff
   scanning the player's QR (approve_completion). There is no client-side
   self-approve anymore, so this screen only DISPLAYS activity state and the
   player's QR affordance — it never awards rewards. */
export function StandScreen({ lang, nav, standId, progress, player }: StandScreenProps) {
  const tx = (o: Localized) => o[lang];
  const { standById, catalogLoading } = useGame();
  const [qr, setQr] = useState(false);

  // Block render until the catalog is loaded so the stand lookup never resolves
  // against an empty/undefined catalog (mirrors the MapScreen guard).
  if (catalogLoading) {
    return (
      <div className="screen scr-anim">
        <div className="wrap narrow" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <div className="pixel" style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: 3 }}>
            {tx(T('CARGANDO...', 'LOADING...'))}
          </div>
        </div>
      </div>
    );
  }

  const st = standById(standId);
  if (!st) return null; // guard: stand not found
  const done = standDoneOf(st, progress);

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow">
        <button className="kbtn" onClick={() => nav('home')}>← {tx(T('Mapa', 'Map'))}</button>

        {/* header */}
        <Card corners raise className="mt10" style={{ borderColor: st.accent, background: 'var(--bg-2)' }}>
          <div className="row center" style={{ gap: 14 }}>
            <Card flat style={{ padding: 8, background: 'var(--panel)', borderColor: st.accent }}>
              <PixelSprite layers={[st.icon]} scale={3} />
            </Card>
            <div className="f1">
              <div className="pixel" style={{ fontSize: 8, color: st.accent }}>{tx(st.tag)}</div>
              <h2 className="h2" style={{ marginTop: 6 }}>{tx(st.name)}</h2>
            </div>
          </div>
          <p className="t" style={{ marginTop: 12 }}>{tx(st.blurb)}</p>
          {/* reward */}
          <div className="row center mt14" style={{ gap: 12, background: 'var(--panel)', padding: 10, border: '2px solid var(--line)' }}>
            <div><PixelSprite layers={[PIECES[st.piece].sprite]} scale={2.4} /></div>
            <div className="f1">
              <div className="pixel" style={{ fontSize: 7, color: 'var(--ink-3)' }}>{tx(T('RECOMPENSA', 'REWARD'))}</div>
              <div className="t" style={{ color: 'var(--ink)' }}>{tx(PIECES[st.piece].name)}</div>
            </div>
            {progress.pieces.includes(st.piece)
              ? <span className="chip on">{tx(T('Obtenida', 'Unlocked'))}</span>
              : <span className="chip">{tx(T('Bloqueada', 'Locked'))}</span>}
          </div>
        </Card>

        {/* activities */}
        <div className="eyebrow mt20" style={{ marginBottom: 10 }}>{tx(T('Actividades del stand', 'Stand activities'))}</div>
        <div className="col">
          {st.activities.map(act => {
            const ok = progress.doneActivities.includes(act.id);
            return (
              <Card key={act.id} flat style={{ padding: 12, borderColor: ok ? 'var(--green)' : 'var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 30, height: 30, flex: '0 0 30px', display: 'grid', placeItems: 'center',
                  background: ok ? 'var(--green)' : 'var(--panel-hi)', border: '2px solid ' + (ok ? 'var(--green)' : 'var(--line)'),
                  color: '#062', fontFamily: 'var(--fontPixel)', fontSize: 12,
                }}>{ok ? '✓' : ''}</div>
                <div className="f1">
                  <div className="t" style={{ color: 'var(--ink)' }}>{tx(act.name)}{act.special && <span className="pixel" style={{ fontSize: 7, color: 'var(--purple)', marginLeft: 8 }}>★ {tx(T('ESPECIAL', 'SPECIAL'))}</span>}</div>
                  <div className="coin" style={{ fontSize: 9, marginTop: 2 }}><PixelSprite layers={['ticket']} scale={1.4} /> +{act.tickets}</div>
                </div>
                {ok
                  ? <span className="pixel" style={{ fontSize: 8, color: 'var(--green)' }}>{tx(T('LISTO', 'DONE'))}</span>
                  : <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{tx(T('PENDIENTE', 'PENDING'))}</span>}
              </Card>
            );
          })}
        </div>

        <p className="t sm center-txt mt14">{tx(T('Muestra tu código QR al staff para acreditar la actividad.', 'Show your QR code to staff to get the activity credited.'))}</p>
        <Btn block variant="ghost" className="mt10" onClick={() => setQr(true)}>{tx(T('Mostrar mi código QR', 'Show my QR code'))}</Btn>
        {done && <div className="center-txt mt14"><span className="chip on">★ {tx(T('STAND COMPLETADO', 'STAND CLEARED'))} ★</span></div>}
      </div>

      {qr && <QrModal lang={lang} player={player} onClose={() => setQr(false)} />}
    </div>
  );
}

interface AvatarScreenProps { lang: Lang; nav: Nav; progress: Progress; player: Player; }
/* ---------------- AVATAR COLLECTION ---------------- */
export function AvatarScreen({ lang, nav, progress, player }: AvatarScreenProps) {
  const tx = (o: Localized) => o[lang];
  const { stands } = useGame();
  const have = progress.pieces;
  const complete = PIECE_ORDER.every(id => have.includes(id));
  const [popId, setPopId] = useState<PieceId | null>(null);
  useEffect(() => {
    const last = progress.lastPiece;
    if (last) { setPopId(last); const timer = setTimeout(() => setPopId(null), 700); return () => clearTimeout(timer); }
  }, [progress.lastPiece]);

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow">
        <div className="eyebrow">{tx(T('Tu colección', 'Your collection'))}</div>
        <h2 className="h1" style={{ marginTop: 6 }}>{tx(T('Mi avatar', 'My avatar'))}</h2>

        <Card corners raise className="mt14" style={{ display: 'grid', placeItems: 'center', padding: 26, background: complete ? 'linear-gradient(180deg,#241a08,#13182b)' : 'var(--bg-2)' }}>
          {complete && <div className="shine" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}></div>}
          <AvatarStage baseId={player.baseId} pieces={have} scale={11} popId={popId} />
          <div className="pixel mt14" style={{ fontSize: 11, color: 'var(--ink)' }}>{(player.name || 'PLAYER').toUpperCase()}</div>
          <div className="spread w100 mt14" style={{ maxWidth: 280 }}>
            <span className="pixel" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{tx(T('PIEZAS', 'PIECES'))}</span>
            <span className="pixel" style={{ fontSize: 9, color: 'var(--orange)' }}>{have.length}/{PIECE_ORDER.length}</span>
          </div>
          <div className="w100" style={{ maxWidth: 280, marginTop: 6 }}><Bar value={have.length} max={PIECE_ORDER.length} segs={PIECE_ORDER.length} orange /></div>
          {complete && <div className="chip on pop mt14">★ {tx(T('¡AVATAR COMPLETO!', 'AVATAR COMPLETE!'))} ★</div>}
        </Card>

        {/* checklist */}
        <div className="eyebrow mt20" style={{ marginBottom: 10 }}>{tx(T('Álbum de piezas', 'Piece album'))}</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
          {PIECE_ORDER.map(id => {
            const pc = PIECES[id]; const ok = have.includes(id);
            const stand = stands.find(s => s.piece === id);
            return (
              <Card key={id} flat style={{ padding: 12, borderColor: ok ? pc.color : 'var(--line)', cursor: ok ? 'default' : 'pointer' }}
                onClick={() => { if (!ok && stand) nav('stand', { standId: stand.id }); }}>
                <div className="row center" style={{ gap: 10 }}>
                  <div className={ok ? '' : 'locked'}><PixelSprite layers={[pc.sprite]} scale={2.4} /></div>
                  <div className="f1">
                    <div className="t" style={{ color: ok ? 'var(--ink)' : 'var(--ink-3)' }}>{tx(pc.name)}</div>
                    <div className="pixel" style={{ fontSize: 6, color: 'var(--ink-3)', marginTop: 3 }}>{tx(pc.slot)}</div>
                  </div>
                </div>
                {stand && <div className="pixel mt10" style={{ fontSize: 7, color: ok ? 'var(--green)' : stand.accent }}>
                  {ok ? '✓ ' + tx(T('OBTENIDA', 'UNLOCKED')) : '→ ' + tx(stand.name)}
                </div>}
              </Card>
            );
          })}
        </div>

        <Btn block className="mt20" onClick={() => nav('home')}>{tx(T('Ir al mapa', 'Go to map'))}</Btn>
      </div>
    </div>
  );
}
