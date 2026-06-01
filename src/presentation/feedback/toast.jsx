'use client';

/* ============================================================
   Presentation · Toast feedback bus
   `showToast` dispatches a window event; `ToastHost` renders the
   queue. A tiny pub/sub so any screen can raise a toast without
   threading a handler through props.
   ============================================================ */

import { useState, useEffect } from 'react';
import { PixelSprite } from '../components/sprites';

export function showToast(detail) {
  window.dispatchEvent(new CustomEvent('quest-toast', { detail }));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    function on(e) {
      const id = Math.random().toString(36).slice(2);
      setItems(x => [...x, { id, ...e.detail }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), e.detail.dur || 2600);
    }
    window.addEventListener('quest-toast', on);
    return () => window.removeEventListener('quest-toast', on);
  }, []);
  return (
    <div className="toast-wrap">
      {items.map(it => (
        <div className="toast" key={it.id}>
          {it.sprite && <PixelSprite layers={Array.isArray(it.sprite) ? it.sprite : [it.sprite]} scale={3} pal={it.pal} />}
          <div>
            <div className="tt">{it.title}</div>
            {it.sub && <div className="ts">{it.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
