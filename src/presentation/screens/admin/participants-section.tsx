'use client';

/* ============================================================
   Presentation · Admin · Participants section (CA-09)

   Lets an admin list participant accounts, edit a participant's username inline,
   and delete a participant account behind an explicit confirm step.

   All operations go through the server-only `/api/admin/participants` Route
   Handler (via the participants repository) — this component never touches the
   service-role key. It is authorised by the admin's own session (bearer token),
   and the server re-verifies the caller is an admin before doing anything.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Card, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { getSupabase } from '../../../infrastructure/supabase-client';
import {
  listParticipants,
  editParticipant,
  deleteParticipant,
  type Participant,
} from '../../../infrastructure/supabase-admin-participants-repository';

interface ParticipantsSectionProps {
  lang: Lang;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '10px 12px',
  background: 'var(--panel)',
  border: '3px solid var(--line)',
  color: 'var(--ink)',
  fontFamily: 'var(--fontBody)',
  fontSize: 18,
  outline: 'none',
  boxSizing: 'border-box',
};

export function ParticipantsSection({ lang }: ParticipantsSectionProps) {
  const tx = (o: Localized) => o[lang];
  const supabase = getSupabase();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoadError(T('Supabase no está configurado.', 'Supabase is not configured.')[lang]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listParticipants(supabase);
      setParticipants(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, lang]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startEdit(p: Participant) {
    setRowError(null);
    setEditingId(p.id);
    setDraftName(p.username);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftName('');
    setRowError(null);
  }

  async function saveEdit(p: Participant) {
    if (!supabase) return;
    setBusyId(p.id);
    setRowError(null);
    try {
      const updated = await editParticipant(supabase, p.id, draftName);
      setParticipants((prev) => prev.map((row) => (row.id === p.id ? updated : row)));
      cancelEdit();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(p: Participant) {
    if (!supabase) return;
    const ok = window.confirm(
      tx(
        T(
          `¿Eliminar la cuenta de "${p.username || p.email}"? Esta acción no se puede deshacer.`,
          `Delete the account for "${p.username || p.email}"? This cannot be undone.`,
        ),
      ),
    );
    if (!ok) return;
    setBusyId(p.id);
    setLoadError(null);
    try {
      await deleteParticipant(supabase, p.id);
      setParticipants((prev) => prev.filter((row) => row.id !== p.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="pixel" style={{ fontSize: 14, color: 'var(--cyan)', letterSpacing: 1 }}>
        {tx(T('Participantes', 'Participants'))}
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
          <Btn size="sm" variant="ghost" className="mt14" onClick={() => void refresh()}>
            {tx(T('Reintentar', 'Retry'))}
          </Btn>
        </Card>
      )}

      {!loading && !loadError && participants.length === 0 && (
        <Card flat style={{ padding: 20, textAlign: 'center' }}>
          <p className="t" style={{ color: 'var(--ink-2)' }}>
            {tx(T('Todavía no hay participantes registrados.', 'No participants registered yet.'))}
          </p>
        </Card>
      )}

      {!loading && participants.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p className="t sm" style={{ color: 'var(--ink-3)' }}>
            {participants.length}{' '}
            {tx(T('cuenta(s) de participante', 'participant account(s)'))}
          </p>

          {participants.map((p) => {
            const isEditing = editingId === p.id;
            const isBusy = busyId === p.id;
            return (
              <Card key={p.id} corners style={{ padding: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {isEditing ? (
                      <div>
                        <label className="pixel" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                          {tx(T('NOMBRE', 'NAME'))}
                        </label>
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          minLength={2}
                          maxLength={14}
                          autoFocus
                          style={inputStyle}
                        />
                        {rowError && (
                          <p className="t sm" style={{ color: 'var(--red, #ff4c4c)', marginTop: 8 }}>
                            {rowError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <span className="t lg" style={{ color: 'var(--ink)' }}>
                          {p.username || p.email}
                        </span>
                        <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
                          {p.email}
                        </p>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <Btn size="sm" disabled={isBusy} onClick={() => void saveEdit(p)}>
                          {isBusy ? tx(T('Guardando...', 'Saving...')) : tx(T('Guardar', 'Save'))}
                        </Btn>
                        <Btn size="sm" variant="ghost" disabled={isBusy} onClick={cancelEdit}>
                          {tx(T('Cancelar', 'Cancel'))}
                        </Btn>
                      </>
                    ) : (
                      <>
                        <Btn size="sm" variant="ghost" disabled={isBusy} onClick={() => startEdit(p)}>
                          {tx(T('Editar', 'Edit'))}
                        </Btn>
                        <Btn size="sm" variant="ghost" disabled={isBusy} onClick={() => void handleDelete(p)}>
                          {isBusy ? tx(T('...', '...')) : tx(T('Eliminar', 'Delete'))}
                        </Btn>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
