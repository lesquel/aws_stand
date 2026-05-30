/* ============================================================
   App shell — state, router, persistence, chrome, actions
   ============================================================ */

const STORE = 'cloudquest_v1';
const emptyProgress = () => ({
  doneActivities: [], pieces: [], badges: [], claimed: [],
  visitedStands: [], tickets: 0, lastPiece: null,
});

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch (e) { return null; }
}

const IN_APP = ['home', 'stand', 'avatar', 'badges', 'prizes'];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "es",
  "heroLayout": "center",
  "scanlines": true
}/*EDITMODE-END*/;

function App() {
  const saved = load();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const lang = t.lang, scanlines = t.scanlines, heroLayout = t.heroLayout;
  const setLang = l => setTweak('lang', l);
  const [player, setPlayer] = useState(saved?.player || null);
  const [progress, setProgress] = useState(saved?.progress || emptyProgress());
  const [route, setRoute] = useState({ screen: 'landing', params: {} });
  const tx = o => o[lang];

  // persist game state (settings live in the tweaks store)
  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify({ player, progress }));
  }, [player, progress]);

  // expose hooks for verifier / host
  useEffect(() => {
    window.__quest = {
      nav, setTweak, setLang,
      reset() { localStorage.removeItem(STORE); location.reload(); },
    };
  });

  function nav(screen, params = {}) {
    if (IN_APP.includes(screen) && !player) { setRoute({ screen: 'register', params: {} }); return; }
    setRoute({ screen, params });
    const sc = document.querySelector('.screen'); if (sc) sc.scrollTop = 0;
  }

  function onCreate({ name, baseId }) {
    setPlayer({ name, baseId });
    setRoute({ screen: 'home', params: {} });
    setTimeout(() => { fireConfetti({ count: 80 }); showToast({ title: tx(T('¡Bienvenido!', 'Welcome!')), sub: name, sprite: 'flag' }); }, 250);
  }

  /* core action: validate an activity */
  function complete(standId, actId) {
    const st = standById(standId);
    const act = st.activities.find(a => a.id === actId);
    if (progress.doneActivities.includes(actId)) return { tickets: 0 };

    const np = JSON.parse(JSON.stringify(progress));
    np.doneActivities.push(actId);
    np.tickets += act.tickets;
    if (!np.visitedStands.includes(standId)) np.visitedStands.push(standId);

    // piece unlock when stand fully done
    let unlockedPiece = null;
    if (standDone(np, standId) && !np.pieces.includes(st.piece)) {
      np.pieces.push(st.piece); np.lastPiece = st.piece; unlockedPiece = st.piece;
    } else { np.lastPiece = null; }

    // badge recompute
    const newBadges = BADGES.filter(b => b.check(np) && !np.badges.includes(b.id)).map(b => b.id);
    np.badges.push(...newBadges);

    setProgress(np);

    // feedback
    showToast({ title: '+' + act.tickets + ' ' + tx(T('TICKETS', 'TICKETS')), sub: tx(act.name), sprite: 'ticket' });
    if (unlockedPiece) showToast({ title: tx(T('¡Pieza nueva!', 'New piece!')), sub: tx(PIECES[unlockedPiece].name), sprite: PIECES[unlockedPiece].sprite, dur: 3200 });
    newBadges.forEach(bid => { const b = BADGES.find(x => x.id === bid); showToast({ title: tx(T('¡Insignia!', 'Badge!')), sub: tx(b.name), sprite: b.icon, dur: 3200 }); });
    if (!unlockedPiece && !newBadges.length) fireConfetti({ count: 40, y: .5 });

    return { tickets: act.tickets, piece: unlockedPiece, badges: newBadges };
  }

  function claim(prizeId) {
    const pz = PRIZES.find(p => p.id === prizeId);
    if (progress.claimed.includes(prizeId) || progress.tickets < pz.cost || pz.stock <= 0) return;
    pz.stock -= 1;
    const np = JSON.parse(JSON.stringify(progress));
    np.tickets -= pz.cost; np.claimed.push(prizeId);
    setProgress(np);
    fireConfetti({ count: 90, colors: ['#ffd23f', '#ff9900', '#fff'] });
    showToast({ title: pz.raffle ? tx(T('¡Inscrito al sorteo!', 'Entered raffle!')) : tx(T('¡Premio canjeado!', 'Prize claimed!')), sub: tx(pz.name), sprite: pz.sprite, dur: 3000 });
  }

  const actions = { complete, claim };
  const showChrome = IN_APP.includes(route.screen);

  // tab config
  const tabs = [
    { id: 'home', ic: 'ic_compass', label: T('Mapa', 'Map') },
    { id: 'avatar', ic: 'buddy', label: T('Avatar', 'Avatar') },
    { id: 'badges', ic: 'ic_medal', label: T('Insignias', 'Badges') },
    { id: 'prizes', ic: 'ticket', label: T('Premios', 'Prizes') },
  ];

  let view;
  const k = route.screen;
  if (k === 'landing') view = <Landing lang={lang} nav={nav} layout={heroLayout} />;
  else if (k === 'register') view = <Register lang={lang} nav={nav} onCreate={onCreate} />;
  else if (k === 'home') view = <MapScreen lang={lang} nav={nav} progress={progress} player={player} />;
  else if (k === 'stand') view = <StandScreen lang={lang} nav={nav} standId={route.params.standId} progress={progress} actions={actions} player={player} />;
  else if (k === 'avatar') view = <AvatarScreen lang={lang} nav={nav} progress={progress} player={player} />;
  else if (k === 'badges') view = <BadgesScreen lang={lang} progress={progress} />;
  else if (k === 'prizes') view = <PrizesScreen lang={lang} progress={progress} actions={actions} />;
  else if (k === 'scanner') view = <ScannerScreen lang={lang} nav={nav} progress={progress} actions={actions} player={player || { name: 'Demo', baseId: 'explorer' }} />;
  else if (k === 'dashboard') view = <DashboardScreen lang={lang} nav={nav} progress={progress} />;

  return (
    <div className={'stage ' + (scanlines ? 'scanlines' : 'scanlines off')}>
      <Stars />

      {/* global language toggle */}
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 60, display: 'flex', gap: 0, border: '2px solid var(--line)', background: 'rgba(19,26,43,.9)' }}>
        {['es', 'en'].map(l => (
          <button key={l} onClick={() => setLang(l)} className="pixel"
            style={{ fontSize: 9, padding: '7px 9px', cursor: 'pointer', border: 0, background: lang === l ? 'var(--orange)' : 'transparent', color: lang === l ? 'var(--ink-on-orange)' : 'var(--ink-3)' }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {showChrome && (
        <div className="appbar">
          <div className="brand" style={{ cursor: 'pointer' }} onClick={() => nav('home')}>
            <PixelSprite layers={['ic_cloud']} scale={1.6} /> CLOUD<b>QUEST</b>
          </div>
          <div className="coin" style={{ fontSize: 11, marginRight: 64 }}>
            <PixelSprite layers={['ticket']} scale={1.8} /> {progress.tickets}
          </div>
        </div>
      )}

      {/* routed screen (keyed for transition) */}
      <div key={k + JSON.stringify(route.params)} style={{ position: 'absolute', inset: 0, top: showChrome ? 56 : 0, bottom: showChrome ? 64 : 0 }}>
        {view}
      </div>

      {showChrome && (
        <div className="tabbar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}>
          {tabs.map(t => {
            const on = route.screen === t.id;
            return (
              <button key={t.id} className={'tab' + (on ? ' on' : '')} onClick={() => nav(t.id)}>
                <span className="ic" style={{ opacity: on ? 1 : .6 }}><PixelSprite layers={[t.ic]} scale={1.5} /></span>
                {tx(t.label)}
              </button>
            );
          })}
        </div>
      )}

      <ToastHost />

      <TweaksPanel title="Tweaks">
        <TweakSection label={tx(T('Idioma', 'Language'))} />
        <TweakRadio label={tx(T('Idioma', 'Language'))} value={lang}
          options={['es', 'en']} onChange={v => setTweak('lang', v)} />
        <TweakSection label={tx(T('Inicio', 'Landing'))} />
        <TweakRadio label={tx(T('Estilo', 'Style'))} value={heroLayout}
          options={['center', 'cabinet', 'split']} onChange={v => setTweak('heroLayout', v)} />
        <TweakSection label={tx(T('Pantalla', 'Screen'))} />
        <TweakToggle label={tx(T('Scanlines CRT', 'CRT scanlines'))} value={scanlines}
          onChange={v => setTweak('scanlines', v)} />
        <TweakSection label={tx(T('Datos', 'Data'))} />
        <TweakButton label={tx(T('Reiniciar mi progreso', 'Reset my progress'))}
          onClick={() => { localStorage.removeItem(STORE); location.reload(); }} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
