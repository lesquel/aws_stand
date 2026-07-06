'use client';

/* ============================================================
   Presentation · Admin · Staff section

   Lets an admin create a staff account and assign it to a stand within an
   event, and lists the current staff per stand with an unassign action.

   Account creation and assignment go through the server-only `/api/admin/staff`
   Route Handler (via the staff repository) — this component never touches the
   service-role key. The event/stand lists are read with the same anon client
   used elsewhere, authorised by the admin's session.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import { listEvents, type AdminEvent } from '../../../infrastructure/supabase-admin-repository';
import { listStands, type AdminStand } from '../../../infrastructure/supabase-admin-stands-repository';
import {
  listStaffAssignments,
  createStaff,
  unassignStaff,
  type StaffAssignment,
} from '../../../infrastructure/supabase-admin-staff-repository';

interface StaffSectionProps {
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

const inputStyle: React.CSSProperties = { ...selectStyle };

const initialForm = { username: '', email: '', password: '', standId: '' };

export function StaffSection({ lang }: StaffSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [stands, setStands] = useState<AdminStand[]>([]);
  const [staff, setStaff] = useState<StaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

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

  const refreshStaff = useCallback(async () => {
    if (!supabase || !eventId) {
      setStaff([]);
      return;
    }
    try {
      const rows = await listStaffAssignments(supabase, eventId);
      setStaff(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [supabase, eventId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void refreshStands();
    void refreshStaff();
  }, [refreshStands, refreshStaff]);

  const standName = useCallback(
    (standId: string) => stands.find((s) => s.id === standId)?.name ?? standId,
    [stands],
  );

  function setField(key: keyof typeof initialForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !eventId) return;
    setSubmitting(true);
    setFormError(null);
    setFormOk(null);
    try {
      const created = await createStaff(supabase, {
        username: form.username,
        email: form.email,
        password: form.password,
        eventId,
        standId: form.standId,
      });
      setForm(initialForm);
      setFormOk(
        tx(T('Staff creado: ', 'Staff created: ')) + created.username + ' (' + created.email + ')',
      );
      await refreshStaff();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnassign(assignment: StaffAssignment) {
    if (!supabase) return;
    const ok = window.confirm(
      tx(T('¿Quitar a este staff del stand?', 'Remove this staff from the stand?')),
    );
    if (!ok) return;
    try {
      await unassignStaff(supabase, assignment.id);
      await refreshStaff();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
        {tx(T('Staff', 'Staff'))}
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
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={selectStyle}>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!loading && eventId && stands.length === 0 && (
        <Card flat style={{ padding: 20, textAlign: 'center' }}>
          <p className="t" style={{ color: 'var(--ink-2)' }}>
            {tx(T('Este evento todavía no tiene stands. Crea uno en la sección Stands.', 'This event has no stands yet. Create one in the Stands section.'))}
          </p>
        </Card>
      )}

      {!loading && eventId && stands.length > 0 && (
        <Card corners style={{ padding: 16 }}>
          <h3 className="pixel" style={{ fontSize: 11, color: 'var(--orange)', letterSpacing: 1, marginBottom: 12 }}>
            {tx(T('Nuevo staff', 'New staff'))}
          </h3>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('NOMBRE', 'NAME'))}
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setField('username', e.target.value)}
                required
                minLength={2}
                maxLength={14}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('EMAIL', 'EMAIL'))}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                required
                autoComplete="off"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('CONTRASEÑA', 'PASSWORD'))}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {tx(T('STAND', 'STAND'))}
              </label>
              <select
                value={form.standId}
                onChange={(e) => setField('standId', e.target.value)}
                required
                style={selectStyle}
              >
                <option value="" disabled>
                  {tx(T('Elige un stand', 'Choose a stand'))}
                </option>
                {stands.map((stand) => (
                  <option key={stand.id} value={stand.id}>
                    {stand.name}
                  </option>
                ))}
              </select>
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

            <Btn type="submit" disabled={submitting || !form.standId}>
              {submitting ? tx(T('Creando...', 'Creating...')) : tx(T('Crear y asignar', 'Create and assign'))}
            </Btn>
          </form>
        </Card>
      )}

      {!loading && eventId && (
        <div style={{ display: 'grid', gap: 12 }}>
          <h3 className="pixel" style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: 1 }}>
            {tx(T('Staff asignado', 'Assigned staff'))}
          </h3>

          {staff.length === 0 && (
            <Card flat style={{ padding: 20, textAlign: 'center' }}>
              <p className="t" style={{ color: 'var(--ink-2)' }}>
                {tx(T('Todavía no hay staff en este evento.', 'No staff in this event yet.'))}
              </p>
            </Card>
          )}

          {staff.map((member) => (
            <Card key={member.id} corners style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <span className="t lg" style={{ color: 'var(--ink)' }}>
                    {member.username || member.email}
                  </span>
                  <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
                    {member.email}
                  </p>
                  <span
                    className="chip"
                    style={{
                      marginTop: 10,
                      borderColor: 'var(--orange)',
                      color: 'var(--ink-2)',
                      background: 'var(--panel-2)',
                    }}
                  >
                    <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-3)' }}>
                      {tx(T('STAND', 'STAND'))}
                    </span>
                    <span style={{ marginLeft: 6, color: 'var(--ink)' }}>{standName(member.standId)}</span>
                  </span>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => void handleUnassign(member)}>
                  {tx(T('Quitar', 'Remove'))}
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
