'use client';

/* ============================================================
   Presentation · Admin · Stands section

   Stands are scoped to an event, so the section first lets the admin pick an
   event, then lists that event's stands (each with its single activity + badge),
   drives create/edit/delete through the admin stands repository, and offers a
   visual map editor (drag / click / arrow-key placement) on top of the numeric
   coordinate inputs in the form. Reads/writes go through the same anon Supabase
   client; the signed-in admin's session authorises the writes via the SP1
   admin-write RLS policies.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { PixelSprite } from '../../components/sprites';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import { listEvents, type AdminEvent } from '../../../infrastructure/supabase-admin-repository';
import {
  listStands,
  createStand,
  updateStand,
  deleteStand,
  type AdminStand,
} from '../../../infrastructure/supabase-admin-stands-repository';
import { StandForm, type StandFormValues } from './stand-form';
import { MapEditor, type MapMarker } from './map-editor';
import { accentForToken } from './stand-catalog';

type FormState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; stand: AdminStand };

interface StandsSectionProps {
  lang: Lang;
}

function markerFor(stand: AdminStand): MapMarker {
  return {
    id: stand.id,
    name: stand.name,
    mapX: stand.mapX,
    mapY: stand.mapY,
    icon: stand.icon,
    accent: stand.accent ?? accentForToken(stand.color),
  };
}

export function StandsSection({ lang }: StandsSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [stands, setStands] = useState<AdminStand[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load the event list once so the admin can scope the stands view.
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

  const refreshStands = useCallback(async () => {
    if (!supabase || !eventId) {
      setStands([]);
      return;
    }
    try {
      const rows = await listStands(supabase, eventId);
      setStands(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [supabase, eventId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void refreshStands();
  }, [refreshStands]);

  function openCreate() {
    setFormError(null);
    setForm({ kind: 'create' });
  }

  function openEdit(stand: AdminStand) {
    setFormError(null);
    setForm({ kind: 'edit', stand });
  }

  function closeForm() {
    if (submitting) return;
    setForm({ kind: 'closed' });
    setFormError(null);
  }

  async function handleSubmit(values: StandFormValues) {
    if (!supabase || !eventId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (form.kind === 'create') {
        await createStand(supabase, eventId, {
          name: values.name,
          slug: values.slug,
          description: values.description,
          tag: values.tag,
          icon: values.icon,
          color: values.color,
          accent: values.accent,
          pieceId: values.pieceId || null,
          mapX: values.mapX,
          mapY: values.mapY,
          sort: values.sort,
          activity: values.activity,
          badge: values.badge,
        });
      } else if (form.kind === 'edit') {
        await updateStand(supabase, form.stand.id, {
          name: values.name,
          description: values.description,
          tag: values.tag,
          icon: values.icon,
          color: values.color,
          accent: values.accent,
          pieceId: values.pieceId || null,
          mapX: values.mapX,
          mapY: values.mapY,
          sort: values.sort,
          activity: { ...values.activity, id: form.stand.activity?.id },
          badge: { ...values.badge, id: form.stand.activity?.badge?.id },
        });
      }
      setForm({ kind: 'closed' });
      await refreshStands();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(stand: AdminStand) {
    if (!supabase) return;
    const ok = window.confirm(
      tx(T('¿Eliminar este stand, su actividad y su insignia?', 'Delete this stand, its activity and its badge?')),
    );
    if (!ok) return;
    try {
      await deleteStand(supabase, stand.id);
      if (selectedId === stand.id) setSelectedId(null);
      await refreshStands();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  // Map editor: live preview (local) then persist on commit.
  function handleMove(id: string, mapX: number, mapY: number) {
    setStands((prev) => prev.map((s) => (s.id === id ? { ...s, mapX, mapY } : s)));
  }

  async function handleCommit(id: string, mapX: number, mapY: number) {
    if (!supabase) return;
    try {
      await updateStand(supabase, id, { mapX, mapY });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      await refreshStands();
    }
  }

  const markers = stands.map(markerFor);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
          {tx(T('Stands', 'Stands'))}
        </h2>
        <Btn size="sm" onClick={openCreate} disabled={!eventId}>
          + {tx(T('Nuevo stand', 'New stand'))}
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
            onChange={(e) => {
              setEventId(e.target.value);
              setSelectedId(null);
            }}
            style={{
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
            }}
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
          <div className="pixel" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 10 }}>
            {tx(T('EDITOR DE MAPA', 'MAP EDITOR'))}
          </div>
          <MapEditor
            lang={lang}
            markers={markers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
            onCommit={handleCommit}
          />
        </Card>
      )}

      {!loading && eventId && stands.length === 0 && (
        <Card flat style={{ padding: 20, textAlign: 'center' }}>
          <p className="t" style={{ color: 'var(--ink-2)' }}>
            {tx(T('Todavía no hay stands en este evento.', 'No stands in this event yet.'))}
          </p>
          <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 6 }}>
            {tx(T('Crea el primero para empezar.', 'Create the first one to get started.'))}
          </p>
        </Card>
      )}

      {!loading &&
        stands.map((stand) => {
          const isSel = stand.id === selectedId;
          const accent = stand.accent ?? accentForToken(stand.color);
          return (
            <Card
              key={stand.id}
              corners
              style={{ padding: 16, borderColor: isSel ? accent : undefined }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setSelectedId(stand.id)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    background: 'none',
                    border: 0,
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      padding: 6,
                      background: 'var(--panel)',
                      border: '3px solid ' + accent,
                      flexShrink: 0,
                    }}
                  >
                    {stand.icon ? (
                      <PixelSprite layers={[stand.icon]} scale={1.5} />
                    ) : (
                      <span className="pixel" style={{ fontSize: 10, color: accent }}>
                        ●
                      </span>
                    )}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="t lg" style={{ color: 'var(--ink)', display: 'block' }}>
                      {stand.name}
                    </span>
                    <span className="pixel" style={{ fontSize: 9, color: 'var(--ink-3)', display: 'block', marginTop: 6 }}>
                      {stand.slug} · ({stand.mapX}, {stand.mapY})
                    </span>
                    {stand.activity && (
                      <span className="t sm" style={{ color: 'var(--ink-2)', display: 'block', marginTop: 6 }}>
                        {tx(T('Actividad', 'Activity'))}: {stand.activity.name}
                        {stand.activity.badge ? ` · ${tx(T('Insignia', 'Badge'))}: ${stand.activity.badge.name}` : ''}
                      </span>
                    )}
                  </span>
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <Btn size="sm" variant="ghost" onClick={() => openEdit(stand)}>
                    {tx(T('Editar', 'Edit'))}
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => void handleDelete(stand)}>
                    {tx(T('Eliminar', 'Delete'))}
                  </Btn>
                </div>
              </div>
            </Card>
          );
        })}

      {form.kind !== 'closed' && (
        <StandForm
          mode={form.kind === 'edit' ? 'edit' : 'create'}
          initial={form.kind === 'edit' ? form.stand : null}
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
