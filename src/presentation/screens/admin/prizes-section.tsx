'use client';

/* ============================================================
   Presentation · Admin · Prizes section

   Prizes are scoped to an event, so the section first lets the admin pick an
   event, then lists that event's prizes (with cost / stock / raffle badges), and
   drives create/edit/delete through the admin prizes repository. Reads/writes go
   through the same anon Supabase client; the signed-in admin's session
   authorises the writes via the SP1 admin-write RLS policy.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import { listEvents, type AdminEvent } from '../../../infrastructure/supabase-admin-repository';
import {
  listPrizes,
  createPrize,
  updatePrize,
  deletePrize,
  type AdminPrize,
} from '../../../infrastructure/supabase-admin-prizes-repository';
import { PrizeForm, type PrizeFormValues } from './prize-form';

type FormState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; prize: AdminPrize };

interface PrizesSectionProps {
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

export function PrizesSection({ lang }: PrizesSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [prizes, setPrizes] = useState<AdminPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load the event list once so the admin can scope the prizes view.
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

  const refreshPrizes = useCallback(async () => {
    if (!supabase || !eventId) {
      setPrizes([]);
      return;
    }
    try {
      const rows = await listPrizes(supabase, eventId);
      setPrizes(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [supabase, eventId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void refreshPrizes();
  }, [refreshPrizes]);

  function openCreate() {
    setFormError(null);
    setForm({ kind: 'create' });
  }

  function openEdit(prize: AdminPrize) {
    setFormError(null);
    setForm({ kind: 'edit', prize });
  }

  function closeForm() {
    if (submitting) return;
    setForm({ kind: 'closed' });
    setFormError(null);
  }

  async function handleSubmit(values: PrizeFormValues) {
    if (!supabase || !eventId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (form.kind === 'create') {
        await createPrize(supabase, eventId, {
          name: values.name,
          slug: values.slug,
          cost: values.cost,
          stock: values.stock,
          raffle: values.raffle,
        });
      } else if (form.kind === 'edit') {
        await updatePrize(supabase, form.prize.id, {
          name: values.name,
          cost: values.cost,
          stock: values.stock,
          raffle: values.raffle,
        });
      }
      setForm({ kind: 'closed' });
      await refreshPrizes();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(prize: AdminPrize) {
    if (!supabase) return;
    const ok = window.confirm(tx(T('¿Eliminar este premio?', 'Delete this prize?')));
    if (!ok) return;
    try {
      await deletePrize(supabase, prize.id);
      await refreshPrizes();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
          {tx(T('Premios', 'Prizes'))}
        </h2>
        <Btn size="sm" onClick={openCreate} disabled={!eventId}>
          + {tx(T('Nuevo premio', 'New prize'))}
        </Btn>
      </div>

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
            onChange={(e) => setEventId(e.target.value)}
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

      {!loading && eventId && prizes.length === 0 && (
        <Card flat style={{ padding: 20, textAlign: 'center' }}>
          <p className="t" style={{ color: 'var(--ink-2)' }}>
            {tx(T('Todavía no hay premios en este evento.', 'No prizes in this event yet.'))}
          </p>
          <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 6 }}>
            {tx(T('Crea el primero para empezar.', 'Create the first one to get started.'))}
          </p>
        </Card>
      )}

      {!loading &&
        prizes.map((prize) => (
          <Card key={prize.id} corners style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="t lg" style={{ color: 'var(--ink)' }}>
                    {prize.name}
                  </span>
                  {prize.raffle && <RaffleBadge lang={lang} />}
                </div>
                <p className="pixel" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 8 }}>
                  {prize.slug}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <StatChip label={tx(T('COSTO', 'COST'))} value={`${prize.cost}`} accent="var(--orange)" />
                  <StatChip label={tx(T('STOCK', 'STOCK'))} value={`${prize.stock}`} accent="var(--cyan)" />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <Btn size="sm" variant="ghost" onClick={() => openEdit(prize)}>
                  {tx(T('Editar', 'Edit'))}
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => void handleDelete(prize)}>
                  {tx(T('Eliminar', 'Delete'))}
                </Btn>
              </div>
            </div>
          </Card>
        ))}

      {form.kind !== 'closed' && (
        <PrizeForm
          mode={form.kind === 'edit' ? 'edit' : 'create'}
          initial={form.kind === 'edit' ? form.prize : null}
          lang={lang}
          submitting={submitting}
          errorMessage={formError}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <span
      className="chip"
      style={{ borderColor: accent, color: 'var(--ink-2)', background: 'var(--panel-2)' }}
    >
      <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>
        {label}
      </span>
      <span style={{ marginLeft: 6, color: 'var(--ink)' }}>{value}</span>
    </span>
  );
}

function RaffleBadge({ lang }: { lang: Lang }) {
  const tx = (o: Localized) => o[lang];
  return (
    <span
      className="chip"
      style={{ borderColor: 'var(--purple, #a06cff)', color: 'var(--ink-2)', background: 'var(--panel-2)' }}
    >
      <span className="dot" style={{ background: 'var(--purple, #a06cff)' }} />
      {tx(T('Sorteo', 'Raffle'))}
    </span>
  );
}
