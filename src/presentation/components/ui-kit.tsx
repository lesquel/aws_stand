'use client';

/* ============================================================
   Presentation · UI kit — pixel cards, buttons, bars, stars, modal
   ============================================================ */

import { useRef, useEffect } from 'react';
import React from 'react';
import { PixelSprite } from './sprites';

interface CardProps {
  children?: React.ReactNode;
  className?: string;
  raise?: boolean;
  flat?: boolean;
  corners?: boolean;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  [key: string]: unknown;
}

export function Card({ children, className = '', raise, flat, corners, style, ...rest }: CardProps) {
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

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  variant?: string;
  size?: string;
  block?: boolean;
  className?: string;
}

export function Btn({ children, variant = '', size = '', block, className = '', ...rest }: BtnProps) {
  return (
    <button className={'btn ' + variant + ' ' + size + (block ? ' block' : '') + ' ' + className} {...rest}>
      {children}
    </button>
  );
}

interface BarProps {
  value: number;
  max: number;
  segs?: number;
  orange?: boolean;
}

/* segmented progress bar */
export function Bar({ value, max, segs = 10, orange }: BarProps) {
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
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cvEl = cv; // capture non-null for closures
    const ctx = cv.getContext('2d')!;
    let raf: number, t = 0;
    function size() { cvEl.width = cvEl.offsetWidth; cvEl.height = cvEl.offsetHeight; }
    size();
    const stars = Array.from({ length: 90 }).map(() => ({
      x: Math.random(), y: Math.random(), s: Math.random() < .15 ? 2 : 1,
      ph: Math.random() * Math.PI * 2, sp: .4 + Math.random() * 1.2,
      c: Math.random() < .2 ? '#ff9900' : (Math.random() < .3 ? '#36c5f0' : '#ffffff'),
    }));
    function draw() {
      t += .016; ctx.clearRect(0, 0, cvEl.width, cvEl.height);
      for (const st of stars) {
        const a = .35 + .45 * (.5 + .5 * Math.sin(t * st.sp + st.ph));
        ctx.globalAlpha = a; ctx.fillStyle = st.c;
        ctx.fillRect(Math.floor(st.x * cvEl.width), Math.floor(st.y * cvEl.height), st.s, st.s);
      }
      ctx.globalAlpha = 1; raf = requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} className="stars"></canvas>;
}

interface ModalProps {
  children?: React.ReactNode;
  onClose: () => void;
}

/* modal shell */
export function Modal({ children, onClose }: ModalProps) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

interface IcoProps {
  name: string;
  scale?: number;
  pal?: Record<string, string | null>;
  className?: string;
  style?: React.CSSProperties;
}

/* tiny inline pixel icon helper */
export function Ico({ name, scale = 3, pal, className = '', style }: IcoProps) {
  return <PixelSprite layers={[name]} scale={scale} pal={pal} className={className} style={style} />;
}
