'use client';

/* ============================================================
   Presentation · Admin · Event form (create / edit)

   Controlled modal form for an event. In create mode the slug auto-derives from
   the name until the admin edits the slug field; in edit mode the slug is shown
   read-only (changing a live slug would break player-facing links). Submission
   and validation/error display are owned by the parent EventsSection.
   ============================================================ */

import { useState } from 'react';
import { Modal, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import {
  slugify,
  EVENT_STATUSES,
  type AdminEvent,
  type EventStatus,
} from '../../../infrastructure/supabase-admin-repository';

const STATUS_LABEL: Record<EventStatus, Localized> = {
  draft: T('Borrador', 'Draft'),
  active: T('Activo', 'Active'),
  archived: T('Archivado', 'Archived'),
};

export interface EventFormValues {
  name: string;
  slug: string;
  description: string;
  status: EventStatus;
}

interface EventFormProps {
  mode: 'create' | 'edit';
  initial: AdminEvent | null;
  lang: Lang;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (values: EventFormValues) => void;
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

const labelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--ink-3)' };

export function EventForm({
  mode,
  initial,
  lang,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: EventFormProps) {
  const tx = (o: Localized) => o[lang];
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? 'draft');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');

  const isCreate = mode === 'create';
  const effectiveSlug = isCreate && !slugTouched ? slugify(name) : slug;
  const canSubmit = name.trim().length > 0 && !submitting;

  function handleNameChange(value: string) {
    setName(value);
    if (isCreate && !slugTouched) setSlug(slugify(value));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ name, slug: effectiveSlug, description, status });
  }

  const title = isCreate
    ? tx(T('Nuevo evento', 'New event'))
    : tx(T('Editar evento', 'Edit event'));

  return (
    <Modal onClose={onCancel}>
      <div style={{ display: 'grid', gap: 14, minWidth: 280 }}>
        <div className="pixel" style={{ fontSize: 12, color: 'var(--orange)', letterSpacing: 1 }}>
          {title}
        </div>

        {errorMessage && (
          <div
            className="pixel"
            style={{
              fontSize: 9,
              color: 'var(--red, #ff4c4c)',
              padding: '10px 12px',
              background: 'var(--panel)',
              border: '2px solid var(--red, #ff4c4c)',
              lineHeight: 1.5,
            }}
          >
            {errorMessage}
          </div>
        )}

        <div>
          <label className="pixel" style={labelStyle}>
            {tx(T('NOMBRE', 'NAME'))}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={tx(T('Cloud Quest 2026', 'Cloud Quest 2026'))}
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <label className="pixel" style={labelStyle}>
            {tx(T('IDENTIFICADOR (SLUG)', 'IDENTIFIER (SLUG)'))}
          </label>
          <input
            type="text"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            disabled={!isCreate}
            placeholder="cloud-quest-2026"
            style={{ ...inputStyle, opacity: isCreate ? 1 : 0.6 }}
          />
          {!isCreate && (
            <p className="t sm" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
              {tx(T('El identificador no se puede cambiar.', 'The identifier cannot be changed.'))}
            </p>
          )}
        </div>

        <div>
          <label className="pixel" style={labelStyle}>
            {tx(T('DESCRIPCIÓN', 'DESCRIPTION'))}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label className="pixel" style={labelStyle}>
            {tx(T('ESTADO', 'STATUS'))}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
            style={inputStyle}
          >
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tx(STATUS_LABEL[s])}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Btn variant="ghost" onClick={onCancel} disabled={submitting}>
            {tx(T('Cancelar', 'Cancel'))}
          </Btn>
          <Btn block onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? tx(T('Guardando...', 'Saving...'))
              : tx(T('Guardar', 'Save'))}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export { STATUS_LABEL };
