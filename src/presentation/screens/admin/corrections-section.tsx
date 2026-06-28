'use client';

/* ============================================================
   Presentation · Admin · Corrections section (RN-09, CA-07)

   Lets an admin look a participant up by their QR token within an event, see
   their current ticket balance, set a NEW absolute total with a mandatory
   reason, and review the append-only correction history (who / when / before →
   after / reason).

   Every operation goes through the SECURITY DEFINER RPCs in the corrections
   repository (authorized server-side as admin OR staff-of-event); this component
   never touches the service-role key. Event lists are read with the same anon
   client used elsewhere, authorized by the admin's session.

   Staff correcting points is allowed by the RPC (RN-09); for this slice the UI is
   admin-only, which is acceptable — the server still authorizes both.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import { listEvents, type AdminEvent } from '../../../infrastructure/supabase-admin-repository';
import {
  findParticipation,
  correctPoints,
  listCorrections,
  type ParticipationLookup,
  type CorrectionEntry,
} from '../../../infrastructure/supabase-corrections-repository';

interface CorrectionsSectionProps {
  lang: Lang;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '12px 12px',
  background: 'var(--panel)',
  border: '3px solid var(--line)',
  color: 'var(--ink)',
  fontFamily: 'var(--fontBody)',
  fontSize: 18,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle };

/** Map an RPC error to a neutral-Spanish / English message by Postgres code. */
function messageFor(err: unknown, lang: Lang): string {
  const code = (err as { code?: string })?.code;
  if (code === '42501') {
    return T('No tenés permiso para corregir puntos en este evento.', 'You are not allowed to correct points for this event.')[lang];
  }
  if (code === 'P0002') {
    return T('No se encontró un participante con ese QR en este evento.', 'No participant with that QR was found in this event.')[lang];
  }
  if (code === '22023') {
    return T('Revisá los datos: el motivo es obligatorio y el total no puede ser negativo.', 'Check the input: a reason is required and the total cannot be negative.')[lang];
  }
  return err instanceof Error ? err.message : String(err);
}

export function CorrectionsSection({ lang }: CorrectionsSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [qrToken, setQrToken] = useState('');
  const [lookup, setLookup] = useState<ParticipationLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [newTotal, setNewTotal] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [history, setHistory] = useState<CorrectionEntry[]>([]);

  const loadEvents = useCallback(async () => {
    if (!supabase) {
      setLoadError(T('Supabase no está configurado.', 'Supabase is not configured.')[lang]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listEvents(supabase);
      setEvents(rows);
      setEventId((current) => current || rows[0]?.id || '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, lang]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // Switching events invalidates the current lookup.
  function resetLookup() {
    setLookup(null);
    setLookupError(null);
    setHistory([]);
    setNewTotal('');
    setReason('');
    setFormError(null);
    setFormOk(null);
  }

  const refreshHistory = useCallback(
    async (participationId: string) => {
      if (!supabase) return;
      try {
        setHistory(await listCorrections(supabase, participationId));
      } catch (err) {
        setFormError(messageFor(err, lang));
      }
    },
    [supabase, lang],
  );

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !eventId || !qrToken.trim()) return;
    setLooking(true);
    setLookupError(null);
    setFormError(null);
    setFormOk(null);
    try {
      const found = await findParticipation(supabase, qrToken.trim(), eventId);
      setLookup(found);
      setNewTotal(String(found.tickets));
      await refreshHistory(found.participationId);
    } catch (err) {
      setLookup(null);
      setHistory([]);
      setLookupError(messageFor(err, lang));
    } finally {
      setLooking(false);
    }
  }

  async function handleCorrect(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !lookup) return;
    const parsed = Number(newTotal);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setFormError(tx(T('Ingresá un total entero de 0 o más.', 'Enter a whole total of 0 or more.')));
      return;
    }
    if (!reason.trim()) {
      setFormError(tx(T('El motivo es obligatorio.', 'A reason is required.')));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setFormOk(null);
    try {
      const result = await correctPoints(supabase, lookup.participationId, parsed, reason.trim());
      setFormOk(
        tx(T('Corregido: ', 'Corrected: ')) +
          `${result.before} → ${result.after} (${result.delta >= 0 ? '+' : ''}${result.delta})`,
      );
      setLookup({ ...lookup, tickets: result.after });
      setReason('');
      await refreshHistory(lookup.participationId);
    } catch (err) {
      setFormError(messageFor(err, lang));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
        {tx(T('Correcciones', 'Corrections'))}
      </h2>

      {loading && (
        <p className="t" style={{ color: 'var(--ink-3)' }}>
          {tx(T('Cargando...', 'Loading...'))}
        </p>
      )}

      {loadError && !loading && (
        <Card flat style={{ padding: 16, borderColor: 'var(--red, #ff4c4c)' }}>
          <p className="t sm" style={{ color: 'var(--red, #ff4c4c)' }}>
            {loadError}
          </p>
          <Btn size="sm" variant="ghost" className="mt14" onClick={() => void loadEvents()}>
            {tx(T('Reintentar', 'Retry'))}
          </Btn>
        </Card>
      )}

      {!loading && !loadError && events.length === 0 && (
        <Card flat style={{ padding: 20, textAlign: 'center' }}>
          <p className="t" style={{ color: 'var(--ink-2)' }}>
            {tx(T('Primero crea un evento en la sección Eventos.', 'Create an event first in the Events section.'))}
          </p>
        </Card>
      )}

      {!loading && events.length > 0 && (
        <div>
          <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
            {tx(T('EVENTO', 'EVENT'))}
          </label>
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              resetLookup();
            }}
            style={selectStyle}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!loading && eventId && (
        <Card corners style={{ padding: 16 }}>
          <h3 className="pixel" style={{ fontSize: 11, color: 'var(--orange)', letterSpacing: 1, marginBottom: 12 }}>
            {tx(T('Buscar participante', 'Find participant'))}
          </h3>
          <form onSubmit={handleLookup} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('TOKEN QR', 'QR TOKEN'))}
              </label>
              <input
                type="text"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder={tx(T('Pegá el token del QR del jugador', "Paste the player's QR token"))}
                style={inputStyle}
              />
            </div>
            {lookupError && (
              <p className="t sm" style={{ color: 'var(--red, #ff4c4c)' }}>
                {lookupError}
              </p>
            )}
            <Btn type="submit" disabled={looking || !qrToken.trim()}>
              {looking ? tx(T('Buscando...', 'Searching...')) : tx(T('Buscar', 'Search'))}
            </Btn>
          </form>
        </Card>
      )}

      {lookup && (
        <Card corners style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span className="t lg" style={{ color: 'var(--ink)' }}>
              {lookup.playerName}
            </span>
            <span className="chip" style={{ borderColor: 'var(--orange)', color: 'var(--ink)', background: 'var(--panel-2)' }}>
              <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>
                {tx(T('PUNTOS', 'POINTS'))}
              </span>
              <span style={{ marginLeft: 6 }}>{lookup.tickets}</span>
            </span>
          </div>

          <form onSubmit={handleCorrect} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('NUEVO TOTAL', 'NEW TOTAL'))}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={newTotal}
                onChange={(e) => setNewTotal(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('MOTIVO', 'REASON'))}
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={300}
                placeholder={tx(T('Por qué se corrige', 'Why it is corrected'))}
                style={inputStyle}
              />
            </div>

            {formError && (
              <p className="t sm" style={{ color: 'var(--red, #ff4c4c)' }}>
                {formError}
              </p>
            )}
            {formOk && (
              <p className="t sm" style={{ color: 'var(--green, #4caf50)' }}>
                {formOk}
              </p>
            )}

            <Btn type="submit" disabled={submitting || !reason.trim()}>
              {submitting ? tx(T('Guardando...', 'Saving...')) : tx(T('Corregir puntos', 'Correct points'))}
            </Btn>
          </form>
        </Card>
      )}

      {lookup && (
        <div style={{ display: 'grid', gap: 12 }}>
          <h3 className="pixel" style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: 1 }}>
            {tx(T('Historial de correcciones', 'Correction history'))}
          </h3>

          {history.length === 0 && (
            <Card flat style={{ padding: 20, textAlign: 'center' }}>
              <p className="t" style={{ color: 'var(--ink-2)' }}>
                {tx(T('Todavía no hay correcciones para este participante.', 'No corrections for this participant yet.'))}
              </p>
            </Card>
          )}

          {history.map((entry) => (
            <Card key={entry.id} corners style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span className="t lg" style={{ color: 'var(--ink)' }}>
                  {entry.pointsBefore} → {entry.pointsAfter}
                  <span style={{ marginLeft: 8, color: entry.delta >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #ff4c4c)' }}>
                    ({entry.delta >= 0 ? '+' : ''}
                    {entry.delta})
                  </span>
                </span>
                <span className="t sm" style={{ color: 'var(--ink-3)' }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="t sm" style={{ color: 'var(--ink-2)', marginTop: 8 }}>
                {entry.reason}
              </p>
              <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
                {tx(T('Por', 'By'))} {entry.correctorName ?? entry.correctedBy}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
