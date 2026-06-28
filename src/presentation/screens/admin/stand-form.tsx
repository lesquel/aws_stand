'use client';

/* ============================================================
   Presentation · Admin · Stand form (create / edit)

   Controlled modal form for a stand AND its single activity (RN-03) AND that
   activity's single badge (RN-04). In create mode the slug auto-derives from the
   name until the admin edits it; in edit mode the slug is read-only (changing a
   live slug would break player-facing links).

   Icons and colors are picked from the FIXED option set (stand-catalog.ts) —
   existing pixel sprites + design tokens, NO uploads. The numeric map_x / map_y
   inputs here are the reliable coordinate fallback; the visual map editor in the
   section provides drag/click placement on top.
   ============================================================ */

import { useState } from 'react';
import { Modal, Btn } from '../../components/ui-kit';
import { PixelSprite } from '../../components/sprites';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { slugify } from '../../../infrastructure/supabase-admin-repository';
import type {
  AdminStand,
  ScoreType,
} from '../../../infrastructure/supabase-admin-stands-repository';
import {
  ICON_OPTIONS,
  COLOR_OPTIONS,
  PIECE_OPTIONS,
  DEFAULT_COLOR,
} from './stand-catalog';

export interface StandFormValues {
  name: string;
  slug: string;
  description: string;
  tag: string;
  icon: string;
  color: string;
  accent: string;
  pieceId: string;
  mapX: number;
  mapY: number;
  sort: number;
  activity: {
    name: string;
    description: string;
    scoreType: ScoreType;
    pointsFixed: number;
    pointsFirst: number;
    pointsSecond: number;
    pointsThird: number;
    special: boolean;
  };
  badge: {
    name: string;
    description: string;
    icon: string;
  };
}

interface StandFormProps {
  mode: 'create' | 'edit';
  initial: AdminStand | null;
  lang: Lang;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (values: StandFormValues) => void;
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
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--cyan)',
  letterSpacing: 1,
  marginTop: 6,
  borderTop: '2px solid var(--line)',
  paddingTop: 14,
};

/** Parse a possibly-empty numeric input into a finite number (fallback on NaN). */
function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function StandForm({
  mode,
  initial,
  lang,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: StandFormProps) {
  const tx = (o: Localized) => o[lang];
  const isCreate = mode === 'create';
  const act = initial?.activity ?? null;
  const badge = act?.badge ?? null;

  // Stand fields
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tag, setTag] = useState(initial?.tag ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? ICON_OPTIONS[0]);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR.token);
  const [accent, setAccent] = useState(initial?.accent ?? DEFAULT_COLOR.accent);
  const [pieceId, setPieceId] = useState<string>(initial?.pieceId ?? '');
  const [mapX, setMapX] = useState(String(initial?.mapX ?? 50));
  const [mapY, setMapY] = useState(String(initial?.mapY ?? 50));
  const [sort, setSort] = useState(String(initial?.sort ?? 0));

  // Activity fields
  const [actName, setActName] = useState(act?.name ?? '');
  const [actDescription, setActDescription] = useState(act?.description ?? '');
  const [scoreType, setScoreType] = useState<ScoreType>(act?.scoreType ?? 'fixed');
  const [pointsFixed, setPointsFixed] = useState(String(act?.pointsFixed ?? 1));
  const [pointsFirst, setPointsFirst] = useState(String(act?.pointsFirst ?? 3));
  const [pointsSecond, setPointsSecond] = useState(String(act?.pointsSecond ?? 2));
  const [pointsThird, setPointsThird] = useState(String(act?.pointsThird ?? 1));
  const [special, setSpecial] = useState(act?.special ?? false);

  // Badge fields
  const [badgeName, setBadgeName] = useState(badge?.name ?? '');
  const [badgeDescription, setBadgeDescription] = useState(badge?.description ?? '');
  const [badgeIcon, setBadgeIcon] = useState(badge?.icon ?? ICON_OPTIONS[0]);

  const effectiveSlug = isCreate && !slugTouched ? slugify(name) : slug;
  const canSubmit =
    name.trim().length > 0 &&
    actName.trim().length > 0 &&
    badgeName.trim().length > 0 &&
    !submitting;

  function handleNameChange(value: string) {
    setName(value);
    if (isCreate && !slugTouched) setSlug(slugify(value));
  }

  function pickColor(token: string, nextAccent: string) {
    setColor(token);
    setAccent(nextAccent);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      name,
      slug: effectiveSlug,
      description,
      tag,
      icon,
      color,
      accent,
      pieceId,
      mapX: toNumber(mapX, 50),
      mapY: toNumber(mapY, 50),
      sort: toNumber(sort, 0),
      activity: {
        name: actName,
        description: actDescription,
        scoreType,
        pointsFixed: toNumber(pointsFixed, 1),
        pointsFirst: toNumber(pointsFirst, 0),
        pointsSecond: toNumber(pointsSecond, 0),
        pointsThird: toNumber(pointsThird, 0),
        special,
      },
      badge: {
        name: badgeName,
        description: badgeDescription,
        icon: badgeIcon,
      },
    });
  }

  const title = isCreate ? tx(T('Nuevo stand', 'New stand')) : tx(T('Editar stand', 'Edit stand'));

  return (
    <Modal onClose={onCancel}>
      <div
        style={{
          display: 'grid',
          gap: 14,
          minWidth: 280,
          maxHeight: '78vh',
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
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

        {/* ---- Stand ---- */}
        <Field label={tx(T('NOMBRE DEL STAND', 'STAND NAME'))}>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={tx(T('Puesto Nube', 'Cloud Outpost'))}
            style={inputStyle}
            autoFocus
          />
        </Field>

        <Field label={tx(T('IDENTIFICADOR (SLUG)', 'IDENTIFIER (SLUG)'))}>
          <input
            type="text"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            disabled={!isCreate}
            placeholder="cloud"
            style={{ ...inputStyle, opacity: isCreate ? 1 : 0.6 }}
          />
          {!isCreate && (
            <p className="t sm" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
              {tx(T('El identificador no se puede cambiar.', 'The identifier cannot be changed.'))}
            </p>
          )}
        </Field>

        <Field label={tx(T('DESCRIPCIÓN', 'DESCRIPTION'))}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label={tx(T('ETIQUETA', 'TAG'))}>
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder={tx(T('AWS · Infraestructura', 'AWS · Infrastructure'))}
            style={inputStyle}
          />
        </Field>

        <Field label={tx(T('ÍCONO', 'ICON'))}>
          <IconPicker value={icon} onChange={setIcon} accent={accent} />
        </Field>

        <Field label={tx(T('COLOR', 'COLOR'))}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {COLOR_OPTIONS.map((c) => {
              const on = c.token === color;
              return (
                <button
                  key={c.token}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={on}
                  title={c.label}
                  onClick={() => pickColor(c.token, c.accent)}
                  style={{
                    width: 34,
                    height: 34,
                    background: c.accent,
                    border: on ? '3px solid var(--ink)' : '3px solid var(--line)',
                    boxShadow: on ? '0 0 0 2px ' + c.accent : 'none',
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </div>
        </Field>

        <Field label={tx(T('PIEZA QUE OTORGA', 'PIECE AWARDED'))}>
          <select value={pieceId} onChange={(e) => setPieceId(e.target.value)} style={inputStyle}>
            <option value="">{tx(T('— ninguna —', '— none —'))}</option>
            {PIECE_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'flex', gap: 12 }}>
          <Field label={tx(T('MAPA X (0–100)', 'MAP X (0–100)'))} style={{ flex: 1 }}>
            <input
              type="number"
              min={0}
              max={100}
              value={mapX}
              onChange={(e) => setMapX(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={tx(T('MAPA Y (0–100)', 'MAP Y (0–100)'))} style={{ flex: 1 }}>
            <input
              type="number"
              min={0}
              max={100}
              value={mapY}
              onChange={(e) => setMapY(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={tx(T('ORDEN', 'SORT'))} style={{ width: 90 }}>
            <input
              type="number"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        {/* ---- Activity ---- */}
        <div className="pixel" style={sectionTitleStyle}>
          {tx(T('ACTIVIDAD', 'ACTIVITY'))}
        </div>

        <Field label={tx(T('NOMBRE DE LA ACTIVIDAD', 'ACTIVITY NAME'))}>
          <input
            type="text"
            value={actName}
            onChange={(e) => setActName(e.target.value)}
            placeholder={tx(T('Lanza el aro a la nube', 'Ring toss to the cloud'))}
            style={inputStyle}
          />
        </Field>

        <Field label={tx(T('DESCRIPCIÓN DE LA ACTIVIDAD', 'ACTIVITY DESCRIPTION'))}>
          <textarea
            value={actDescription}
            onChange={(e) => setActDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label={tx(T('TIPO DE PUNTAJE', 'SCORE TYPE'))}>
          <select
            value={scoreType}
            onChange={(e) => setScoreType(e.target.value as ScoreType)}
            style={inputStyle}
          >
            <option value="fixed">{tx(T('Fijo', 'Fixed'))}</option>
            <option value="position">{tx(T('Por posición', 'By position'))}</option>
          </select>
        </Field>

        {scoreType === 'fixed' ? (
          <Field label={tx(T('PUNTOS', 'POINTS'))}>
            <input
              type="number"
              min={0}
              value={pointsFixed}
              onChange={(e) => setPointsFixed(e.target.value)}
              style={inputStyle}
            />
          </Field>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label={tx(T('1.º', '1st'))} style={{ flex: 1 }}>
              <input
                type="number"
                min={0}
                value={pointsFirst}
                onChange={(e) => setPointsFirst(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label={tx(T('2.º', '2nd'))} style={{ flex: 1 }}>
              <input
                type="number"
                min={0}
                value={pointsSecond}
                onChange={(e) => setPointsSecond(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label={tx(T('3.º', '3rd'))} style={{ flex: 1 }}>
              <input
                type="number"
                min={0}
                value={pointsThird}
                onChange={(e) => setPointsThird(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
        )}

        <label
          className="t"
          style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />
          {tx(T('Actividad especial', 'Special activity'))}
        </label>

        {/* ---- Badge ---- */}
        <div className="pixel" style={sectionTitleStyle}>
          {tx(T('INSIGNIA', 'BADGE'))}
        </div>

        <Field label={tx(T('NOMBRE DE LA INSIGNIA', 'BADGE NAME'))}>
          <input
            type="text"
            value={badgeName}
            onChange={(e) => setBadgeName(e.target.value)}
            placeholder={tx(T('Maestro de la Nube', 'Cloud Champion'))}
            style={inputStyle}
          />
        </Field>

        <Field label={tx(T('DESCRIPCIÓN DE LA INSIGNIA', 'BADGE DESCRIPTION'))}>
          <textarea
            value={badgeDescription}
            onChange={(e) => setBadgeDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label={tx(T('ÍCONO DE LA INSIGNIA', 'BADGE ICON'))}>
          <IconPicker value={badgeIcon} onChange={setBadgeIcon} accent={accent} />
        </Field>

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

interface FieldProps {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function Field({ label, children, style }: FieldProps) {
  return (
    <div style={style}>
      <label className="pixel" style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  );
}

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  accent: string;
}

function IconPicker({ value, onChange, accent }: IconPickerProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {ICON_OPTIONS.map((name) => {
        const on = name === value;
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={on}
            title={name}
            onClick={() => onChange(name)}
            style={{
              display: 'grid',
              placeItems: 'center',
              padding: 6,
              background: 'var(--panel)',
              border: on ? '3px solid ' + accent : '3px solid var(--line)',
              cursor: 'pointer',
            }}
          >
            <PixelSprite layers={[name]} scale={1.5} />
          </button>
        );
      })}
    </div>
  );
}
