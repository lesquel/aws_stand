'use client';

/* ============================================================
   Presentation · Admin · Winners section (CA-08, RN-07/08/10)

   At event close, the admin picks an event and scans participants' QR codes to
   validate the top 3 (major prize) and all-badges participants (extra reward).
   The eligibility card is computed server-side by the SECURITY DEFINER
   `validate_winner` RPC (authorized as admin OR staff-of-event); this component
   only picks the event and mounts the reusable WinnerValidationCard.

   Event lists are read with the same anon client used elsewhere, authorized by
   the admin's session. The staff console mounts the same WinnerValidationCard
   scoped to the staffer's assigned event.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { WinnerValidationCard } from '../../components/winner-validation';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import { listEvents, type AdminEvent } from '../../../infrastructure/supabase-admin-repository';

interface WinnersSectionProps {
  lang: Lang;
}

const selectStyle: React.CSSProperties = {
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

export function WinnersSection({ lang }: WinnersSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
        {tx(T('Validar ganadores', 'Validate winners'))}
      </h2>
      <p className="t sm" style={{ color: 'var(--ink-3)' }}>
        {tx(T(
          'Al cierre, escanea el QR de cada participante para confirmar su identidad y elegibilidad (top 3 y badges completos).',
          "At close, scan each participant's QR to confirm their identity and eligibility (top 3 and all badges).",
        ))}
      </p>

      {loading && (
        <p className="t" style={{ color: 'var(--ink-3)' }}>{tx(T('Cargando...', 'Loading...'))}</p>
      )}

      {loadError && !loading && (
        <Card flat style={{ padding: 16, borderColor: 'var(--red, #ff4c4c)' }}>
          <p className="t sm" style={{ color: 'var(--red, #ff4c4c)' }}>{loadError}</p>
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
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={selectStyle}>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
      )}

      {!loading && eventId && (
        <Card corners style={{ padding: 16 }}>
          <WinnerValidationCard lang={lang} eventId={eventId} />
        </Card>
      )}
    </div>
  );
}
