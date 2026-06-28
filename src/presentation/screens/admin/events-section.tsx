'use client';

/* ============================================================
   Presentation · Admin · Events section

   Lists ALL events (draft/active/archived — admin RLS exposes the full set) and
   drives create/edit through the thin admin repository. Reads/writes go through
   the same anon Supabase client the rest of the app uses; the signed-in admin's
   session authorises the writes via the SP1 admin-write RLS policy.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import {
  listEvents,
  createEvent,
  updateEvent,
  type AdminEvent,
  type EventStatus,
} from '../../../infrastructure/supabase-admin-repository';
import { EventForm, STATUS_LABEL, type EventFormValues } from './event-form';

type FormState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; event: AdminEvent };

const STATUS_ACCENT: Record<EventStatus, string> = {
  draft: 'var(--ink-3)',
  active: 'var(--green)',
  archived: 'var(--line)',
};

interface EventsSectionProps {
  lang: Lang;
}

export function EventsSection({ lang }: EventsSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, lang]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setFormError(null);
    setForm({ kind: 'create' });
  }

  function openEdit(event: AdminEvent) {
    setFormError(null);
    setForm({ kind: 'edit', event });
  }

  function closeForm() {
    if (submitting) return;
    setForm({ kind: 'closed' });
    setFormError(null);
  }

  async function handleSubmit(values: EventFormValues) {
    if (!supabase) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (form.kind === 'create') {
        await createEvent(supabase, {
          name: values.name,
          slug: values.slug,
          description: values.description,
          status: values.status,
        });
      } else if (form.kind === 'edit') {
        await updateEvent(supabase, form.event.id, {
          name: values.name,
          description: values.description,
          status: values.status,
        });
      }
      setForm({ kind: 'closed' });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
          {tx(T('Eventos', 'Events'))}
        </h2>
        <Btn size="sm" onClick={openCreate}>
          + {tx(T('Nuevo evento', 'New event'))}
        </Btn>
      </div>

      {loading && (
        <p className="t" style={{ color: 'var(--ink-3)' }}>
          {tx(T('Cargando eventos...', 'Loading events...'))}
        </p>
      )}

      {loadError && !loading && (
        <Card flat style={{ padding: 16, borderColor: 'var(--red, #ff4c4c)' }}>
          <p className="t sm" style={{ color: 'var(--red, #ff4c4c)' }}>
            {loadError}
          </p>
          <Btn size="sm" variant="ghost" className="mt14" onClick={() => void refresh()}>
            {tx(T('Reintentar', 'Retry'))}
          </Btn>
        </Card>
      )}

      {!loading && !loadError && events.length === 0 && (
        <Card flat style={{ padding: 20, textAlign: 'center' }}>
          <p className="t" style={{ color: 'var(--ink-2)' }}>
            {tx(T('Todavía no hay eventos.', 'No events yet.'))}
          </p>
          <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 6 }}>
            {tx(T('Crea el primero para empezar.', 'Create the first one to get started.'))}
          </p>
        </Card>
      )}

      {!loading &&
        events.map((event) => (
          <Card key={event.id} corners style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="t lg" style={{ color: 'var(--ink)' }}>
                    {event.name}
                  </span>
                  <StatusBadge status={event.status} lang={lang} />
                </div>
                <p className="pixel" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 8 }}>
                  {event.slug}
                </p>
                {event.description && (
                  <p className="t sm" style={{ color: 'var(--ink-2)', marginTop: 8 }}>
                    {event.description}
                  </p>
                )}
              </div>
              <Btn size="sm" variant="ghost" onClick={() => openEdit(event)}>
                {tx(T('Editar', 'Edit'))}
              </Btn>
            </div>
          </Card>
        ))}

      {form.kind !== 'closed' && (
        <EventForm
          mode={form.kind === 'edit' ? 'edit' : 'create'}
          initial={form.kind === 'edit' ? form.event : null}
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

function StatusBadge({ status, lang }: { status: EventStatus; lang: Lang }) {
  const accent = STATUS_ACCENT[status];
  return (
    <span
      className="chip"
      style={{
        borderColor: accent,
        color: status === 'active' ? 'var(--ink-on-orange)' : 'var(--ink-2)',
        background: status === 'active' ? 'var(--green)' : 'var(--panel-2)',
      }}
    >
      <span className="dot" style={{ background: accent }} />
      {STATUS_LABEL[status][lang]}
    </span>
  );
}
