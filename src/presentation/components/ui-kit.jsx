'use client';

/* ============================================================
   Presentation · UI kit — pixel cards, buttons, bars, stars, modal
   ============================================================ */

import { useRef, useEffect } from 'react';
import { PixelSprite } from './sprites';

export function Card({ children, className = '', raise, flat, corners, style, ...rest }) {
  return (
    <div className={'card ' + (flat ? 'flat ' : '') + (raise ? 'raise ' : '') + className} style={style} {...rest}>
      {corners && !flat && (<>
        <span className="corner tl"></span><span className="corner tr"></span>
        <span className="corner bl"></span><span className="corner br"></span>
      </>)}
      {children}
    </div>
  );
}

export function Btn({ children, variant = '', size = '', block, className = '', ...rest }) {
  return (
    <button className={'btn ' + variant + ' ' + size + (block ? ' block' : '') + ' ' + className} {...rest}>
      {children}
    </button>
  );
}

/* segmented progress bar */
export function Bar({ value, max, segs = 10, orange }) {
  const filled = Math.round((value / max) * segs);
  return (
    <div className={'bar' + (orange ? ' orange' : '')}>
      {Array.from({ length: segs }).map((_, i) =>
        <div key={i} className={'seg' + (i < filled ? ' fill' : '')}></div>)}
    </div>
  );
}

/* twinkling starfield */
export function Stars() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; const ctx = cv.getContext('2d');
    let raf, t = 0; const DPR = 1;
    function size() { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; }
    size();
    const stars = Array.from({ length: 90 }).map(() => ({
      x: Math.random(), y: Math.random(), s: Math.random() < .15 ? 2 : 1,
      ph: Math.random() * Math.PI * 2, sp: .4 + Math.random() * 1.2,
      c: Math.random() < .2 ? '#ff9900' : (Math.random() < .3 ? '#36c5f0' : '#ffffff'),
    }));
    function draw() {
      t += .016; ctx.clearRect(0, 0, cv.width, cv.height);
      for (const st of stars) {
        const a = .35 + .45 * (.5 + .5 * Math.sin(t * st.sp + st.ph));
        ctx.globalAlpha = a; ctx.fillStyle = st.c;
        ctx.fillRect(Math.floor(st.x * cv.width), Math.floor(st.y * cv.height), st.s, st.s);
      }
      ctx.globalAlpha = 1; raf = requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} className="stars"></canvas>;
}

/* modal shell */
export function Modal({ children, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* tiny inline pixel icon helper */
export function Ico({ name, scale = 3, pal, className = '', style }) {
  return <PixelSprite layers={[name]} scale={scale} pal={pal} className={className} style={style} />;
}
