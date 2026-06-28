'use client';

/* ============================================================
   Presentation · Admin · Prize form (create / edit)

   Controlled modal form for an event prize. In create mode the slug auto-derives
   from the name until the admin edits the slug field; in edit mode the slug is
   read-only (changing a live slug would break player-facing links). Submission
   and validation/error display are owned by the parent PrizesSection.
   ============================================================ */

import { useState } from 'react';
import { Modal, Btn } from '../../components/ui-kit';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { slugify } from '../../../infrastructure/supabase-admin-repository';
import type { AdminPrize } from '../../../infrastructure/supabase-admin-prizes-repository';

export interface PrizeFormValues {
  name: string;
  slug: string;
  cost: number;
  stock: number;
  raffle: boolean;
}

interface PrizeFormProps {
  mode: 'create' | 'edit';
  initial: AdminPrize | null;
  lang: Lang;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (values: PrizeFormValues) => void;
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

/** Parse a possibly-empty numeric input into a finite number (fallback on NaN). */
function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function PrizeForm({
  mode,
  initial,
  lang,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: PrizeFormProps) {
  const tx = (o: Localized) => o[lang];
  const isCreate = mode === 'create';

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [cost, setCost] = useState(String(initial?.cost ?? 0));
  const [stock, setStock] = useState(String(initial?.stock ?? 0));
  const [raffle, setRaffle] = useState(initial?.raffle ?? false);

  const effectiveSlug = isCreate && !slugTouched ? slugify(name) : slug;
  const canSubmit = name.trim().length > 0 && !submitting;

  function handleNameChange(value: string) {
    setName(value);
    if (isCreate && !slugTouched) setSlug(slugify(value));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      name,
      slug: effectiveSlug,
      cost: toNumber(cost, 0),
      stock: toNumber(stock, 0),
      raffle,
    });
  }

  const title = isCreate
    ? tx(T('Nuevo premio', 'New prize'))
    : tx(T('Editar premio', 'Edit prize'));

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
            placeholder={tx(T('Pack de stickers', 'Sticker pack'))}
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
            placeholder="stickers"
            style={{ ...inputStyle, opacity: isCreate ? 1 : 0.6 }}
          />
          {!isCreate && (
            <p className="t sm" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
              {tx(T('El identificador no se puede cambiar.', 'The identifier cannot be changed.'))}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="pixel" style={labelStyle}>
              {tx(T('COSTO (TICKETS)', 'COST (TICKETS)'))}
            </label>
            <input
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="pixel" style={labelStyle}>
              {tx(T('STOCK', 'STOCK'))}
            </label>
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <label
          className="t"
          style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={raffle} onChange={(e) => setRaffle(e.target.checked)} />
          {tx(T('Es un sorteo', 'Is a raffle'))}
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Btn variant="ghost" onClick={onCancel} disabled={submitting}>
            {tx(T('Cancelar', 'Cancel'))}
          </Btn>
          <Btn block onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? tx(T('Guardando...', 'Saving...')) : tx(T('Guardar', 'Save'))}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
