'use client';

/* ============================================================
   Presentation · Winner validation (event close — CA-08, RN-07/08/10)

   Reusable card the staff console AND the admin console mount at event close.
   Given an `eventId`, it scans a player's QR (continuous scanner + a manual
   token fallback that auto-opens when the camera is denied/unavailable), calls
   the SECURITY DEFINER `validate_winner` RPC, and renders the eligibility card:
   player name, points, rank #N, badges X/Y, with clear "TOP 3" / "all badges"
   indicators or a neutral "no califica" state.

   All scoring is server-side and authorized by staff_assignments / admin role;
   this component never trusts a client-side computation and never touches the
   service-role key.
   ============================================================ */

import { useCallback, useRef, useState } from 'react';
import { Btn, Card } from './ui-kit';
import { QrScanner, type QrCameraError } from './qr-scanner';
import { T } from '../../domain/i18n';
import type { Lang, Localized } from '../../domain/types';
import { getSupabase } from '../../infrastructure/supabase-client';
import {
  validateWinner,
  type WinnerValidation,
} from '../../infrastructure/supabase-winner-repository';

interface WinnerValidationCardProps {
  lang: Lang;
  eventId: string;
}

const DEDUP_WINDOW_MS = 2500;

/** Map an RPC error to a neutral-Spanish / English message by Postgres code. */
function messageFor(err: unknown, lang: Lang): string {
  const code = (err as { code?: string })?.code;
  if (code === '42501') {
    return T('No tienes permiso para validar ganadores en este evento.', 'You are not allowed to validate winners for this event.')[lang];
  }
  if (code === 'P0002') {
    return T('No se encontró un participante con ese QR en este evento.', 'No participant with that QR was found in this event.')[lang];
  }
  return err instanceof Error ? err.message : String(err);
}

export function WinnerValidationCard({ lang, eventId }: WinnerValidationCardProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [result, setResult] = useState<WinnerValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [cameraError, setCameraError] = useState<QrCameraError | null>(null);

  const processingRef = useRef(false);
  const recentRef = useRef<{ token: string; at: number } | null>(null);

  const validate = useCallback(
    async (rawToken: string) => {
      const token = rawToken.trim();
      if (!token || !supabase || !eventId || processingRef.current) return;

      const now = Date.now();
      const recent = recentRef.current;
      if (recent && recent.token === token && now - recent.at < DEDUP_WINDOW_MS) return;
      recentRef.current = { token, at: now };

      processingRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const card = await validateWinner(supabase, token, eventId);
        setResult(card);
      } catch (err) {
        setResult(null);
        setError(messageFor(err, lang));
      } finally {
        processingRef.current = false;
        setBusy(false);
      }
    },
    [supabase, eventId, lang],
  );

  const handleCameraError = useCallback((kind: QrCameraError) => {
    setCameraError(kind);
    setManualOpen(true);
  }, []);

  function submitManual() {
    const value = manualValue.trim();
    if (!value || busy) return;
    void validate(value);
    setManualValue('');
  }

  if (!supabase) {
    return (
      <Card flat style={{ padding: 16, borderColor: 'var(--line)' }}>
        <p className="t sm" style={{ color: 'var(--ink-2)' }}>
          {tx(T('Supabase no está configurado.', 'Supabase is not configured.'))}
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* scanner */}
      <div style={{ position: 'relative' }}>
        {!cameraError ? (
          <QrScanner onDecode={(t) => void validate(t)} onError={handleCameraError} />
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
          <div
            className="pixel"
            style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, color: 'var(--cyan)', background: 'rgba(0,0,0,.6)', padding: '4px 6px' }}
          >
            {tx(T('VALIDANDO...', 'VALIDATING...'))}
          </div>
        )}
      </div>

      {/* manual entry — always available */}
      <Btn block variant="ghost" size="sm" onClick={() => setManualOpen((v) => !v)}>
        {tx(T('Ingresar código', 'Type code'))}
      </Btn>

      {manualOpen && (
        <div>
          <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
            {tx(T('TOKEN QR DEL JUGADOR', "PLAYER QR TOKEN"))}
          </label>
          <input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitManual();
            }}
            placeholder={tx(T('Pega o escribe el token', 'Paste or type the token'))}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: '100%', marginTop: 8, padding: '12px 14px', background: 'var(--panel)',
              border: '3px solid var(--line)', color: 'var(--ink)', fontFamily: 'var(--fontPixel)',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <Btn block size="sm" className="mt10" disabled={!manualValue.trim() || busy} onClick={submitManual}>
            {tx(T('Validar', 'Validate'))} ▶
          </Btn>
        </div>
      )}

      {error && (
        <Card flat style={{ padding: 14, borderColor: 'var(--red, #ff4c4c)' }}>
          <p className="t sm" style={{ color: 'var(--red, #ff4c4c)' }}>{error}</p>
        </Card>
      )}

      {result && <ResultCard lang={lang} result={result} />}
    </div>
  );
}

/* ── Result card ───────────────────────────────────────────────────────────── */

function ResultCard({ lang, result }: { lang: Lang; result: WinnerValidation }) {
  const tx = (o: Localized) => o[lang];
  const qualifies = result.isTop3 || result.hasAllBadges;
  const accent = qualifies ? 'var(--cyan)' : 'var(--line)';

  return (
    <Card corners raise style={{ borderColor: accent, background: 'var(--bg-2)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span className="t lg" style={{ color: 'var(--ink)' }}>{result.playerName}</span>
        <span className="chip" style={{ borderColor: accent, color: 'var(--ink)', background: 'var(--panel-2)' }}>
          <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{tx(T('PUNTOS', 'POINTS'))}</span>
          <span style={{ marginLeft: 6 }}>{result.tickets}</span>
        </span>
      </div>

      <div className="row mt14" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="chip" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
          <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{tx(T('PUESTO', 'RANK'))}</span>
          <span style={{ marginLeft: 6 }}>#{result.rank}</span>
        </span>
        <span className="chip" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
          <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{tx(T('BADGES', 'BADGES'))}</span>
          <span style={{ marginLeft: 6 }}>{result.badgesCount}/{result.totalBadges}</span>
        </span>
      </div>

      <div className="col mt14" style={{ gap: 8 }}>
        {result.isTop3 && (
          <div className="pixel" style={{ fontSize: 12, color: 'var(--orange)' }}>
            🏆 {tx(T('TOP 3', 'TOP 3'))} — {tx(T('premio mayor', 'major prize'))}
          </div>
        )}
        {result.hasAllBadges && (
          <div className="pixel" style={{ fontSize: 12, color: 'var(--cyan)' }}>
            ✅ {tx(T('Todos los badges', 'All badges'))} — {tx(T('recompensa extra', 'extra reward'))}
          </div>
        )}
        {!qualifies && (
          <div className="t sm" style={{ color: 'var(--ink-3)' }}>
            {tx(T('No califica para premio mayor ni recompensa extra.', 'Does not qualify for the major prize or extra reward.'))}
          </div>
        )}
      </div>
    </Card>
  );
}
