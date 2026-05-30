/* ============================================================
   UI kit — pixel buttons, cards, bars, confetti, toasts, stars
   ============================================================ */

function Card({ children, className = '', raise, flat, corners, style, ...rest }) {
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

function Btn({ children, variant = '', size = '', block, className = '', ...rest }) {
  return (
    <button className={'btn ' + variant + ' ' + size + (block ? ' block' : '') + ' ' + className} {...rest}>
      {children}
    </button>
  );
}

/* segmented progress bar */
function Bar({ value, max, segs = 10, orange }) {
  const filled = Math.round((value / max) * segs);
  return (
    <div className={'bar' + (orange ? ' orange' : '')}>
      {Array.from({ length: segs }).map((_, i) =>
        <div key={i} className={'seg' + (i < filled ? ' fill' : '')}></div>)}
    </div>
  );
}

/* twinkling starfield */
function Stars() {
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

/* ---- confetti: pixel squares burst ---- */
function fireConfetti(opts = {}) {
  const colors = opts.colors || ['#ff9900', '#36c5f0', '#2bd576', '#ff5c8a', '#9b6dff', '#ffd23f'];
  const n = opts.count || 90;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:9800;pointer-events:none;image-rendering:pixelated;';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  function size() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  size();
  const ox = (opts.x != null ? opts.x : .5) * cv.width;
  const oy = (opts.y != null ? opts.y : .42) * cv.height;
  const parts = Array.from({ length: n }).map(() => {
    const ang = Math.random() * Math.PI * 2;
    const spd = 4 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 6,
      sz: (Math.random() < .5 ? 5 : 8), c: colors[(Math.random() * colors.length) | 0],
      life: 1, rot: 0,
    };
  });
  let raf, frame = 0;
  function step() {
    frame++; ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    for (const p of parts) {
      p.vy += .42; p.vx *= .99; p.x += p.vx; p.y += p.vy;
      p.life -= .009;
      if (p.life > 0 && p.y < cv.height + 20) {
        alive = true;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
      }
    }
    ctx.globalAlpha = 1;
    if (alive && frame < 240) raf = requestAnimationFrame(step);
    else { cancelAnimationFrame(raf); cv.remove(); }
  }
  step();
}

/* ---- toast bus ---- */
function showToast(detail) {
  window.dispatchEvent(new CustomEvent('quest-toast', { detail }));
}
function ToastHost() {
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

/* ---- modal ---- */
function Modal({ children, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* tiny inline pixel icon helper */
function Ico({ name, scale = 3, pal, className = '', style }) {
  return <PixelSprite layers={[name]} scale={scale} pal={pal} className={className} style={style} />;
}

Object.assign(window, { Card, Btn, Bar, Stars, fireConfetti, showToast, ToastHost, Modal, Ico });
