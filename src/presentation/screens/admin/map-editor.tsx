'use client';

/* ============================================================
   Presentation · Admin · Visual map editor

   Renders the event map background with one marker per stand at its
   (map_x, map_y) percentage position — the SAME coordinate space the
   player-facing MapScreen uses (core.tsx). Three ways to set coordinates:

     1. Select a stand, then click an empty spot on the map.
     2. Drag a stand's marker.
     3. Focus a marker and nudge it with the arrow keys (Shift = larger step).

   This is purely presentational: it reports coordinate changes through
   `onMove` (live, for local preview) and `onCommit` (persist). The numeric
   map_x / map_y inputs in the stand form remain the reliable fallback,
   especially on touch devices.
   ============================================================ */

import { useRef, useState } from 'react';
import { PixelSprite } from '../../components/sprites';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';

export interface MapMarker {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  icon: string | null;
  accent: string;
}

interface MapEditorProps {
  lang: Lang;
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Live coordinate change (drag / click / keyboard) for local preview. */
  onMove: (id: string, mapX: number, mapY: number) => void;
  /** Persist the coordinates (drag end, click-place, keyboard nudge). */
  onCommit: (id: string, mapX: number, mapY: number) => void;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const KEY_STEP = 1;
const KEY_STEP_LARGE = 5;

export function MapEditor({
  lang,
  markers,
  selectedId,
  onSelect,
  onMove,
  onCommit,
}: MapEditorProps) {
  const tx = (o: Localized) => o[lang];
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const lastCoords = useRef<{ x: number; y: number } | null>(null);

  function coordsFromEvent(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.round(clamp(((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.round(clamp(((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }

  function handleSurfaceClick(e: React.MouseEvent<HTMLDivElement>) {
    // Only react to clicks on the empty surface, not bubbled marker clicks.
    if (e.target !== e.currentTarget) return;
    if (!selectedId) return;
    const c = coordsFromEvent(e);
    if (!c) return;
    onMove(selectedId, c.x, c.y);
    onCommit(selectedId, c.x, c.y);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    onSelect(id);
    setDragId(id);
    lastCoords.current = null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported — drag still works via move events */
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (dragId !== id) return;
    const c = coordsFromEvent(e);
    if (!c) return;
    lastCoords.current = c;
    onMove(id, c.x, c.y);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (dragId === id) {
      setDragId(null);
      if (lastCoords.current) onCommit(id, lastCoords.current.x, lastCoords.current.y);
      lastCoords.current = null;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, m: MapMarker) {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault();
    const x = clamp(m.mapX + dx);
    const y = clamp(m.mapY + dy);
    onSelect(m.id);
    onMove(m.id, x, y);
    onCommit(m.id, x, y);
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p className="pixel" style={{ fontSize: 9, color: 'var(--ink-3)', lineHeight: 1.7 }}>
        {tx(
          T(
            'Selecciona un stand y toca el mapa para ubicarlo, o arrastra su marcador. Con un marcador enfocado, usa las flechas (Shift = paso grande).',
            'Select a stand and tap the map to place it, or drag its marker. With a marker focused, use the arrow keys (Shift = larger step).',
          ),
        )}
      </p>
      <div
        ref={surfaceRef}
        onClick={handleSurfaceClick}
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '70%',
          background: 'linear-gradient(180deg,#10182c,#0d1322)',
          border: '3px solid var(--line)',
          overflow: 'hidden',
          cursor: selectedId ? 'crosshair' : 'default',
          touchAction: 'none',
        }}
      >
        {markers.map((m) => {
          const isSel = m.id === selectedId;
          return (
            <button
              key={m.id}
              type="button"
              aria-label={m.name}
              aria-pressed={isSel}
              title={m.name}
              onPointerDown={(e) => handlePointerDown(e, m.id)}
              onPointerMove={(e) => handlePointerMove(e, m.id)}
              onPointerUp={(e) => handlePointerUp(e, m.id)}
              onKeyDown={(e) => handleKeyDown(e, m)}
              style={{
                position: 'absolute',
                left: m.mapX + '%',
                top: m.mapY + '%',
                transform: 'translate(-50%,-50%)',
                cursor: dragId === m.id ? 'grabbing' : 'grab',
                display: 'grid',
                placeItems: 'center',
                padding: 6,
                background: 'var(--panel)',
                border: '3px solid ' + m.accent,
                boxShadow: isSel
                  ? '0 0 0 3px rgba(255,153,0,.45), 0 4px 0 rgba(0,0,0,.5)'
                  : '0 4px 0 rgba(0,0,0,.5)',
                zIndex: isSel ? 3 : 2,
                touchAction: 'none',
              }}
            >
              {m.icon ? (
                <PixelSprite layers={[m.icon]} scale={1.5} />
              ) : (
                <span className="pixel" style={{ fontSize: 10, color: m.accent }}>
                  ●
                </span>
              )}
            </button>
          );
        })}
        {markers.length === 0 && (
          <span
            className="pixel"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 9,
              color: 'var(--ink-3)',
            }}
          >
            {tx(T('Sin stands todavía', 'No stands yet'))}
          </span>
        )}
      </div>
    </div>
  );
}
