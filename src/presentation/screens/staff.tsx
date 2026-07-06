'use client';

/* ============================================================
   Presentation · Staff screen — station console (SP3)
   Staff are admin-assigned to an (event + stand); there is no self-enrollment.
   Flow:
   - Load the caller's assignments (fetchMyAssignments). No assignments → a clear
     "not assigned" message.
   - Pick an assigned stand → station scan mode for that stand's activity.
   - Scan mode: a continuous QR scanner credits each scanned player via
     approveCompletion; a "Type code" manual fallback is always available (and
     auto-shown when the camera is denied/unavailable). Position-scored
     activities expose a 1/2/3 selector before crediting.
   All scoring is server-side and authorized by staff_assignments.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '../../domain/i18n';
import { Btn, Card } from '../components/ui-kit';
import { PixelSprite } from '../components/sprites';
import { QrScanner, type QrCameraError } from '../components/qr-scanner';
import { WinnerValidationCard } from '../components/winner-validation';
import { showToast } from '../feedback/toast';
import type { Lang, Nav, Localized } from '../../domain/types';
import type { StaffAssignment, ApproveResult } from '../../infrastructure/supabase-staff-repository';

interface StaffScreenProps {
  lang: Lang;
  nav: Nav;
  getStaffAssignments: () => Promise<StaffAssignment[]>;
  approveCompletion: (qrToken: string, activityId: string, position?: number) => Promise<ApproveResult>;
}

export function StaffScreen({ lang, nav, getStaffAssignments, approveCompletion }: StaffScreenProps) {
  const tx = (o: Localized) => o[lang];

  const [assignments, setAssignments] = useState<StaffAssignment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState<StaffAssignment | null>(null);
  const [winnerFor, setWinnerFor] = useState<StaffAssignment | null>(null);

  // Keep the latest loader without re-running the mount effect. getStaffAssignments
  // is a plain (non-memoized) function from GameProvider, so it gets a new identity
  // on every provider render; depending on it would re-fire the load on unrelated
  // state changes (write-behind save, catalog load, lang toggle) and a transient
  // background error would flip a valid staff user into the "could not load" view.
  const getAssignmentsRef = useRef(getStaffAssignments);
  getAssignmentsRef.current = getStaffAssignments;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getAssignmentsRef.current();
        if (!cancelled) setAssignments(list);
      } catch {
        if (!cancelled) { setAssignments([]); setLoadError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []); // load once on mount

  // Loading
  if (assignments === null) {
    return (
      <Centered>
        <div className="pixel" style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: 3 }}>
          {tx(T('CARGANDO...', 'LOADING...'))}
        </div>
      </Centered>
    );
  }

  // Winner-validation mode (event close) for the picked stand's event
  if (winnerFor) {
    return (
      <WinnerMode
        lang={lang}
        assignment={winnerFor}
        onBack={() => setWinnerFor(null)}
        onExit={() => nav('landing')}
      />
    );
  }

  // Scan mode for the picked stand
  if (active) {
    return (
      <ScanMode
        lang={lang}
        assignment={active}
        approveCompletion={approveCompletion}
        onBack={() => setActive(null)}
        onExit={() => nav('landing')}
        onWinner={() => { setWinnerFor(active); setActive(null); }}
      />
    );
  }

  // No assignments → not staff anywhere
  if (assignments.length === 0) {
    return (
      <div className="screen scr-anim">
        <div className="wrap narrow" style={{ paddingTop: 30 }}>
          <button className="kbtn" onClick={() => nav('landing')}>← {tx(T('Volver', 'Back'))}</button>
          <div className="eyebrow mt10" style={{ color: 'var(--cyan)' }}>{tx(T('MODO STAFF', 'STAFF MODE'))}</div>
          <h2 className="h1" style={{ marginTop: 8 }}>{tx(T('Sin asignación', 'No assignment'))}</h2>
          <Card flat className="mt20" style={{ padding: 16, borderColor: 'var(--line)' }}>
            <p className="t">
              {loadError
                ? tx(T('No se pudieron cargar tus asignaciones. Intenta de nuevo.', 'Could not load your assignments. Please try again.'))
                : tx(T('No estás asignado a ningún stand. Pide a un administrador que te asigne.', 'You are not assigned to any stand. Ask an administrator to assign you.'))}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // Pick a stand
  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 30 }}>
        <button className="kbtn" onClick={() => nav('landing')}>← {tx(T('Volver', 'Back'))}</button>
        <div className="eyebrow mt10" style={{ color: 'var(--cyan)' }}>{tx(T('MODO STAFF', 'STAFF MODE'))}</div>
        <h2 className="h1" style={{ marginTop: 8 }}>{tx(T('Elige tu estación', 'Pick your station'))}</h2>

        <div className="col mt20" style={{ gap: 10 }}>
          {assignments.map((a) => {
            const disabled = a.activity === null;
            return (
              <button
                key={a.id}
                disabled={disabled}
                onClick={() => setActive(a)}
                className="clickable"
                style={{
                  background: 'var(--panel)',
                  border: '3px solid ' + (a.standAccent ?? 'var(--line)'),
                  padding: '14px 16px', cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                }}
              >
                {a.standIcon && <PixelSprite layers={[a.standIcon]} scale={2.4} />}
                <div className="f1">
                  <div className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{a.eventName}</div>
                  <div className="pixel" style={{ fontSize: 12, color: a.standAccent ?? 'var(--ink)', marginTop: 4 }}>{a.standName}</div>
                  <div className="t sm" style={{ color: 'var(--ink-2)', marginTop: 4 }}>
                    {a.activity ? a.activity.name : tx(T('Sin actividad configurada', 'No activity configured'))}
                  </div>
                </div>
                {!disabled && <span className="pixel" style={{ fontSize: 12, color: a.standAccent ?? 'var(--cyan)' }}>▶</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Scan mode ─────────────────────────────────────────────────────────────── */

type Banner =
  | { kind: 'ok'; name: string; points: number }
  | { kind: 'dup'; name: string }
  | { kind: 'err'; msg: string };

interface ScanModeProps {
  lang: Lang;
  assignment: StaffAssignment;
  approveCompletion: (qrToken: string, activityId: string, position?: number) => Promise<ApproveResult>;
  onBack: () => void;
  onExit: () => void;
  onWinner: () => void;
}

const DEDUP_WINDOW_MS = 2500;

function ScanMode({ lang, assignment, approveCompletion, onBack, onExit, onWinner }: ScanModeProps) {
  const tx = (o: Localized) => o[lang];
  const activity = assignment.activity!; // guarded by the picker (disabled when null)
  const isPosition = activity.scoreType === 'position';
  const accent = assignment.standAccent ?? 'var(--cyan)';

  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [position, setPosition] = useState<1 | 2 | 3>(1);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<QrCameraError | null>(null);

  const processingRef = useRef(false);
  const recentRef = useRef<{ token: string; at: number } | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  const credit = useCallback(async (rawToken: string) => {
    const token = rawToken.trim();
    if (!token || processingRef.current) return;

    const now = Date.now();
    const recent = recentRef.current;
    if (recent && recent.token === token && now - recent.at < DEDUP_WINDOW_MS) return;
    recentRef.current = { token, at: now };

    processingRef.current = true;
    setBusy(true);
    try {
      const res = await approveCompletion(token, activity.id, isPosition ? positionRef.current : undefined);
      if (res.alreadyAwarded) {
        setBanner({ kind: 'dup', name: res.playerName });
        showToast({ title: tx(T('Ya participó aquí', 'Already participated here')), sub: res.playerName, sprite: 'flag' });
      } else {
        setBanner({ kind: 'ok', name: res.playerName, points: res.points });
        showToast({ title: `✓ ${res.playerName}`, sub: `+${res.points}`, sprite: 'ticket' });
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const msg = code === '42501'
        ? tx(T('No autorizado para este stand', 'Not authorized for this stand'))
        : tx(T('Código inválido o desconocido', 'Invalid or unknown code'));
      setBanner({ kind: 'err', msg });
      showToast({ title: msg, sprite: 'flag' });
    } finally {
      processingRef.current = false;
      setBusy(false);
    }
  }, [approveCompletion, activity.id, isPosition, lang]);

  // Camera denied/unavailable → reveal manual entry automatically.
  const handleCameraError = useCallback((kind: QrCameraError) => {
    setCameraError(kind);
    setManualOpen(true);
  }, []);

  function submitManual() {
    const value = manualValue.trim();
    if (!value || busy) return;
    void credit(value);
    setManualValue('');
  }

  const pointsForPosition = (p: 1 | 2 | 3): number | null =>
    p === 1 ? activity.pointsFirst : p === 2 ? activity.pointsSecond : activity.pointsThird;

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 30 }}>
        {/* header */}
        <div className="spread">
          <button className="kbtn" onClick={onBack}>← {tx(T('Estaciones', 'Stations'))}</button>
          <button className="kbtn" onClick={onExit}>✕</button>
        </div>

        <Card corners raise className="mt14" style={{ borderColor: accent, background: 'var(--bg-2)', padding: 16 }}>
          <div className="pixel" style={{ fontSize: 8, color: accent }}>{assignment.standName.toUpperCase()}</div>
          <div className="h2" style={{ marginTop: 6 }}>{activity.name}</div>
          <div className="t sm" style={{ color: 'var(--ink-2)', marginTop: 4 }}>
            {isPosition
              ? tx(T('Puntos por posición', 'Points by position'))
              : `+${activity.pointsFixed} ${tx(T('puntos', 'points'))}`}
          </div>
        </Card>

        {/* event-close winner validation (CA-08) — scoped to this stand's event */}
        <Btn block variant="ghost" size="sm" className="mt14" onClick={onWinner}>
          🏆 {tx(T('Validar ganador', 'Validate winner'))}
        </Btn>

        {/* position selector (position-scored activities only) */}
        {isPosition && (
          <div className="mt20">
            <div className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 8 }}>
              {tx(T('POSICIÓN', 'POSITION'))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {([1, 2, 3] as const).map((p) => {
                const pts = pointsForPosition(p);
                return (
                  <button
                    key={p}
                    onClick={() => setPosition(p)}
                    className="clickable f1"
                    style={{
                      background: position === p ? 'var(--panel-hi)' : 'var(--panel)',
                      border: '3px solid ' + (position === p ? accent : 'var(--line)'),
                      padding: '12px 8px', cursor: 'pointer', textAlign: 'center',
                    }}
                  >
                    <div className="pixel" style={{ fontSize: 16, color: position === p ? accent : 'var(--ink-2)' }}>{p}º</div>
                    <div className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)', marginTop: 4 }}>
                      +{pts ?? 0}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* scanner */}
        <div className="mt20" style={{ position: 'relative' }}>
          {!cameraError ? (
            <QrScanner onDecode={(t) => void credit(t)} onError={handleCameraError} />
          ) : (
            <Card flat style={{ padding: 16, borderColor: 'var(--line)' }}>
              <p className="t sm" style={{ color: 'var(--ink-2)' }}>
                {cameraError === 'permission'
                  ? tx(T('Cámara bloqueada. Usa el ingreso manual del código.', 'Camera blocked. Use manual code entry.'))
                  : tx(T('Cámara no disponible. Usa el ingreso manual del código.', 'Camera unavailable. Use manual code entry.'))}
              </p>
            </Card>
          )}
          {busy && (
            <div className="pixel" style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, color: accent, background: 'rgba(0,0,0,.6)', padding: '4px 6px' }}>
              {tx(T('REGISTRANDO...', 'CREDITING...'))}
            </div>
          )}
        </div>

        {/* last-scan feedback (reliable in station mode, beyond the toast) */}
        {banner && (
          <Card
            flat
            className="mt14"
            style={{
              padding: 14,
              borderColor: banner.kind === 'ok' ? 'var(--cyan)' : banner.kind === 'dup' ? 'var(--orange)' : 'var(--red, #ff4c4c)',
              background: 'var(--panel-2)',
            }}
          >
            {banner.kind === 'ok' && (
              <div className="pixel" style={{ fontSize: 12, color: 'var(--cyan)' }}>✓ {banner.name} +{banner.points}</div>
            )}
            {banner.kind === 'dup' && (
              <div className="pixel" style={{ fontSize: 11, color: 'var(--orange)' }}>{tx(T('Ya participó aquí', 'Already participated here'))} · {banner.name}</div>
            )}
            {banner.kind === 'err' && (
              <div className="pixel" style={{ fontSize: 10, color: 'var(--red, #ff4c4c)' }}>{banner.msg}</div>
            )}
          </Card>
        )}

        {/* manual entry — always available */}
        <Btn block variant="ghost" size="sm" className="mt20" onClick={() => setManualOpen((v) => !v)}>
          {tx(T('Ingresar código', 'Type code'))}
        </Btn>

        {manualOpen && (
          <div className="mt14">
            <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tx(T('CÓDIGO DEL JUGADOR', 'PLAYER CODE'))}</label>
            <input
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
              placeholder={tx(T('Pega o escribe el código', 'Paste or type the code'))}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: '100%', marginTop: 8, padding: '12px 14px', background: 'var(--panel)',
                border: '3px solid var(--line)', color: 'var(--ink)', fontFamily: 'var(--fontPixel)',
                fontSize: 14, outline: 'none',
              }}
            />
            <Btn block size="sm" className="mt10" disabled={!manualValue.trim() || busy} onClick={submitManual}>
              {tx(T('Registrar', 'Credit'))} ▶
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Winner-validation mode (event close) ──────────────────────────────────── */

interface WinnerModeProps {
  lang: Lang;
  assignment: StaffAssignment;
  onBack: () => void;
  onExit: () => void;
}

function WinnerMode({ lang, assignment, onBack, onExit }: WinnerModeProps) {
  const tx = (o: Localized) => o[lang];
  const accent = assignment.standAccent ?? 'var(--cyan)';

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 30 }}>
        <div className="spread">
          <button className="kbtn" onClick={onBack}>← {tx(T('Estación', 'Station'))}</button>
          <button className="kbtn" onClick={onExit}>✕</button>
        </div>

        <Card corners raise className="mt14" style={{ borderColor: accent, background: 'var(--bg-2)', padding: 16 }}>
          <div className="pixel" style={{ fontSize: 8, color: accent }}>{assignment.eventName.toUpperCase()}</div>
          <div className="h2" style={{ marginTop: 6 }}>{tx(T('Validar ganador', 'Validate winner'))}</div>
          <div className="t sm" style={{ color: 'var(--ink-2)', marginTop: 4 }}>
            {tx(T('Escanea el QR para ver puesto y badges.', 'Scan the QR to see rank and badges.'))}
          </div>
        </Card>

        <div className="mt20">
          <WinnerValidationCard lang={lang} eventId={assignment.eventId} />
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      {children}
    </div>
  );
}
