/* ============================================================
   Meta screens — Badges, Prizes, Staff scanner, Organizer dashboard
   ============================================================ */

/* ---------------- BADGES ---------------- */
function BadgesScreen({ lang, progress }) {
  const tx = o => o[lang];
  const earned = BADGES.filter(b => progress.badges.includes(b.id)).length;
  return (
    <div className="screen scr-anim">
      <div className="wrap">
        <div className="eyebrow">{tx(T('Logros', 'Achievements'))}</div>
        <div className="spread">
          <h2 className="h1" style={{ marginTop: 6 }}>{tx(T('Mis insignias', 'My badges'))}</h2>
          <span className="pixel" style={{ fontSize: 12, color: 'var(--orange)' }}>{earned}/{BADGES.length}</span>
        </div>
        <div className="grid mt20" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
          {BADGES.map(b => {
            const ok = progress.badges.includes(b.id);
            return (
              <Card key={b.id} corners={ok} raise={ok} style={{ padding: 16, borderColor: ok ? 'var(--yellow)' : 'var(--line)', background: ok ? 'var(--bg-2)' : 'var(--panel)' }}>
                <div className="row center" style={{ gap: 14 }}>
                  <div className={ok ? 'bob' : 'locked'} style={{ filter: ok ? 'drop-shadow(0 0 8px rgba(255,210,63,.5))' : '' }}>
                    <PixelSprite layers={[b.icon]} scale={3} />
                  </div>
                  <div className="f1">
                    <div className="pixel" style={{ fontSize: 11, color: ok ? 'var(--ink)' : 'var(--ink-3)' }}>{tx(b.name)}</div>
                    <div className="t sm" style={{ marginTop: 6 }}>{tx(b.desc)}</div>
                  </div>
                </div>
                <div className="pixel mt14" style={{ fontSize: 8, color: ok ? 'var(--yellow)' : 'var(--ink-3)', textAlign: 'right' }}>
                  {ok ? '★ ' + tx(T('CONSEGUIDA', 'EARNED')) : '🔒 ' + tx(T('EN PROGRESO', 'IN PROGRESS'))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- PRIZES ---------------- */
function PrizesScreen({ lang, progress, actions }) {
  const tx = o => o[lang];
  return (
    <div className="screen scr-anim">
      <div className="wrap">
        <div className="spread">
          <div>
            <div className="eyebrow">{tx(T('Canjea tus tickets', 'Redeem your tickets'))}</div>
            <h2 className="h1" style={{ marginTop: 6 }}>{tx(T('Premios', 'Prizes'))}</h2>
          </div>
          <div className="coin" style={{ fontSize: 16, background: 'var(--panel-2)', border: '2px solid var(--line)', padding: '10px 14px' }}>
            <PixelSprite layers={['ticket']} scale={2.4} /> {progress.tickets}
          </div>
        </div>

        <div className="grid mt20" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
          {PRIZES.map(pz => {
            const claimed = progress.claimed.includes(pz.id);
            const canBuy = progress.tickets >= pz.cost && !claimed && pz.stock > 0;
            return (
              <Card key={pz.id} flat style={{ padding: 16, borderColor: pz.raffle ? 'var(--purple)' : 'var(--line)' }}>
                <div className="row center" style={{ gap: 14 }}>
                  <Card flat style={{ padding: 8, background: 'var(--panel-2)' }}><PixelSprite layers={[pz.sprite]} scale={2.6} /></Card>
                  <div className="f1">
                    <div className="t" style={{ color: 'var(--ink)' }}>{tx(pz.name)}</div>
                    {pz.raffle
                      ? <div className="pixel" style={{ fontSize: 7, color: 'var(--purple)', marginTop: 4 }}>★ {tx(T('SORTEO', 'RAFFLE'))}</div>
                      : <div className="t sm" style={{ marginTop: 2 }}>{tx(T('Stock', 'Stock'))}: {pz.stock}</div>}
                  </div>
                </div>
                <div className="spread mt14">
                  <span className="coin" style={{ fontSize: 11 }}><PixelSprite layers={['ticket']} scale={1.6} /> {pz.cost}</span>
                  {claimed
                    ? <span className="chip on">{tx(T('Canjeado', 'Claimed'))}</span>
                    : <Btn size="sm" disabled={!canBuy} onClick={() => actions.claim(pz.id)}>{pz.raffle ? tx(T('Participar', 'Enter')) : tx(T('Canjear', 'Redeem'))}</Btn>}
                </div>
              </Card>
            );
          })}
        </div>
        <p className="t sm center-txt mt20">{tx(T('Gana tickets completando actividades en cada stand.', 'Earn tickets by completing activities at each stand.'))}</p>
      </div>
    </div>
  );
}

/* ---------------- STAFF SCANNER ---------------- */
function ScannerScreen({ lang, nav, progress, actions, player }) {
  const tx = o => o[lang];
  const [phase, setPhase] = useState('idle'); // idle | scanning | found
  const pending = STANDS.map(s => ({ s, acts: s.activities.filter(a => !progress.doneActivities.includes(a.id)) }))
    .filter(x => x.acts.length);

  function scan() {
    setPhase('scanning');
    setTimeout(() => setPhase('found'), 1400);
  }

  return (
    <div className="screen scr-anim">
      <div className="wrap narrow" style={{ paddingTop: 30 }}>
        <div className="spread">
          <div>
            <div className="eyebrow" style={{ color: 'var(--cyan)' }}>{tx(T('Modo staff', 'Staff mode'))}</div>
            <h2 className="h1" style={{ marginTop: 6 }}>{tx(T('Validar actividad', 'Validate activity'))}</h2>
          </div>
          <button className="kbtn" onClick={() => nav('landing')}>✕</button>
        </div>

        {/* scanner viewport */}
        <Card corners raise className="mt20" style={{ background: '#080c16', borderColor: 'var(--cyan)', padding: 0, overflow: 'hidden' }}>
          <div style={{ position: 'relative', height: 300, display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,rgba(54,197,240,.06) 0 2px,transparent 2px 6px)' }}></div>
            {/* corner brackets */}
            {[['tl', 20, 20], ['tr', 20, 20], ['bl', 20, 20], ['br', 20, 20]].map(([k], idx) => {
              const pos = { tl: { top: 24, left: 24 }, tr: { top: 24, right: 24 }, bl: { bottom: 24, left: 24 }, br: { bottom: 24, right: 24 } }[k];
              const b = '4px solid var(--cyan)';
              const st = { position: 'absolute', width: 36, height: 36, ...pos };
              if (k[0] === 't') st.borderTop = b; if (k[1] === 'l' || k === 'tl' || k === 'bl') st.borderLeft = b;
              if (k[0] === 'b') st.borderBottom = b; if (k[1] === 'r' || k === 'tr' || k === 'br') st.borderRight = b;
              return <div key={k} style={st}></div>;
            })}
            {phase === 'found'
              ? <div className="pop center-txt"><div style={{ background: '#fff', padding: 10, border: '3px solid var(--cyan)', display: 'inline-block' }}><PixelSprite layers={['qr']} scale={6} /></div></div>
              : <div style={{ position: 'relative' }}>
                  <div style={{ opacity: phase === 'scanning' ? .4 : .25 }}><PixelSprite layers={['qr']} scale={7} /></div>
                  {phase === 'scanning' && <div style={{ position: 'absolute', left: -10, right: -10, height: 4, background: 'var(--cyan)', boxShadow: '0 0 12px var(--cyan)', animation: 'scanmove 1.2s ease-in-out infinite' }}></div>}
                  <style>{`@keyframes scanmove{0%{top:0}50%{top:100%}100%{top:0}}`}</style>
                </div>}
          </div>
        </Card>

        {phase !== 'found'
          ? <Btn block size="lg" variant="cyan" className="mt20" disabled={phase === 'scanning'} onClick={scan}>
              {phase === 'scanning' ? tx(T('Escaneando…', 'Scanning…')) : tx(T('Escanear QR del asistente', 'Scan attendee QR'))}
            </Btn>
          : <>
              {/* player found */}
              <Card corners className="mt20" style={{ background: 'var(--bg-2)' }}>
                <div className="row center" style={{ gap: 14 }}>
                  <Card flat style={{ padding: 6, background: 'var(--panel)' }}><Avatar baseId={player.baseId} pieces={progress.pieces} scale={3} /></Card>
                  <div className="f1">
                    <div className="pixel" style={{ fontSize: 12, color: 'var(--ink)' }}>{(player.name || 'PLAYER').toUpperCase()}</div>
                    <div className="t sm">#{(player.name || 'PLAYER').toUpperCase().replace(/\s/g, '').slice(0, 6)}-2026 · {progress.doneActivities.length} {tx(T('actividades', 'activities'))}</div>
                  </div>
                  <span className="chip on">{tx(T('Válido', 'Valid'))}</span>
                </div>
              </Card>

              <div className="eyebrow mt20" style={{ marginBottom: 10, color: 'var(--cyan)' }}>{tx(T('Marca lo que completó', 'Mark what they completed'))}</div>
              {pending.length === 0
                ? <Card flat style={{ padding: 20, textAlign: 'center' }}><div className="t">{tx(T('¡Todo completado! 🎉', 'All completed! 🎉'))}</div></Card>
                : <div className="col">
                    {pending.map(({ s, acts }) => (
                      <Card key={s.id} flat style={{ padding: 12, borderColor: s.accent }}>
                        <div className="row center" style={{ gap: 10, marginBottom: 8 }}>
                          <PixelSprite layers={[s.icon]} scale={1.6} />
                          <span className="pixel" style={{ fontSize: 9, color: s.accent }}>{tx(s.name)}</span>
                        </div>
                        <div className="col" style={{ gap: 8 }}>
                          {acts.map(a => (
                            <div key={a.id} className="spread">
                              <span className="t sm" style={{ color: 'var(--ink-2)' }}>{tx(a.name)}</span>
                              <Btn size="sm" variant="green" onClick={() => actions.complete(s.id, a.id)}>✓ {tx(T('Validar', 'Mark'))}</Btn>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>}
              <Btn block variant="ghost" className="mt20" onClick={() => setPhase('idle')}>{tx(T('Escanear otro', 'Scan another'))}</Btn>
            </>}
      </div>
    </div>
  );
}

/* ---------------- ORGANIZER DASHBOARD ---------------- */
function DashboardScreen({ lang, nav, progress }) {
  const tx = o => o[lang];
  // mock aggregate data + live player's contribution
  const baseVisits = { cloud: 184, ia: 156, sec: 132, crew: 171, build: 98 };
  const kpis = [
    { ic: 'ic_people', label: T('Asistentes', 'Attendees'), val: '312', c: 'var(--cyan)' },
    { ic: 'ic_star', label: T('Validaciones', 'Validations'), val: (742 + progress.doneActivities.length).toString(), c: 'var(--green)' },
    { ic: 'cap', label: T('Piezas entregadas', 'Pieces handed'), val: (598 + progress.pieces.length).toString(), c: 'var(--orange)' },
    { ic: 'ic_trophy', label: T('Premios canjeados', 'Prizes claimed'), val: (87 + progress.claimed.length).toString(), c: 'var(--yellow)' },
  ];
  const maxVisit = Math.max(...Object.values(baseVisits));

  return (
    <div className="screen scr-anim">
      <div className="wrap">
        <div className="spread">
          <div>
            <div className="eyebrow">{tx(T('Panel del organizador', 'Organizer panel'))}</div>
            <h2 className="h1" style={{ marginTop: 6 }}>Cloud Quest · {tx(T('Consola', 'Console'))}</h2>
          </div>
          <button className="kbtn" onClick={() => nav('landing')}>✕</button>
        </div>

        {/* KPIs */}
        <div className="grid mt20" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          {kpis.map((k, i) => (
            <Card key={i} flat style={{ padding: 16 }}>
              <div className="row center" style={{ gap: 10 }}><PixelSprite layers={[k.ic]} scale={2} /><span className="pixel" style={{ fontSize: 7, color: 'var(--ink-3)' }}>{tx(k.label)}</span></div>
              <div className="pixel mt10" style={{ fontSize: 24, color: k.c }}>{k.val}</div>
            </Card>
          ))}
        </div>

        <div className="grid mt20" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)' }}>
          {/* visits chart */}
          <Card corners style={{ padding: 18 }}>
            <div className="h2" style={{ fontSize: 12 }}>{tx(T('Participación por stand', 'Participation by stand'))}</div>
            <div className="col mt20" style={{ gap: 14 }}>
              {STANDS.map(s => {
                const v = baseVisits[s.id];
                return (
                  <div key={s.id}>
                    <div className="spread" style={{ marginBottom: 5 }}>
                      <span className="pixel" style={{ fontSize: 8, color: 'var(--ink-2)' }}>{tx(s.name)}</span>
                      <span className="pixel" style={{ fontSize: 8, color: s.accent }}>{v}</span>
                    </div>
                    <div style={{ height: 14, background: 'var(--panel-hi)', border: '1px solid var(--line)' }}>
                      <div style={{ height: '100%', width: (v / maxVisit * 100) + '%', background: s.accent }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* stand management */}
          <Card corners style={{ padding: 18 }}>
            <div className="spread"><div className="h2" style={{ fontSize: 12 }}>{tx(T('Gestión de stands', 'Manage stands'))}</div></div>
            <div className="col mt14" style={{ gap: 8 }}>
              {STANDS.map(s => (
                <div key={s.id} className="row center" style={{ gap: 10, background: 'var(--panel-2)', border: '2px solid var(--line)', padding: 8 }}>
                  <PixelSprite layers={[s.icon]} scale={1.5} />
                  <div className="f1">
                    <div className="t" style={{ fontSize: 18, color: 'var(--ink)' }}>{tx(s.name)}</div>
                    <div className="pixel" style={{ fontSize: 6, color: 'var(--ink-3)', marginTop: 2 }}>{s.activities.length} {tx(T('actividades', 'activities'))} · {tx(PIECES[s.piece].name)}</div>
                  </div>
                  <span className="chip" style={{ borderColor: s.accent, color: s.accent }}>{tx(T('Activo', 'Live'))}</span>
                </div>
              ))}
            </div>
            <Btn block size="sm" variant="ghost" className="mt14">+ {tx(T('Nuevo stand', 'New stand'))}</Btn>
          </Card>
        </div>

        {/* prizes stock */}
        <Card corners className="mt20" style={{ padding: 18 }}>
          <div className="h2" style={{ fontSize: 12 }}>{tx(T('Inventario de premios', 'Prize inventory'))}</div>
          <div className="grid mt14" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
            {PRIZES.map(p => (
              <div key={p.id} className="row center" style={{ gap: 12, background: 'var(--panel-2)', border: '2px solid var(--line)', padding: 10 }}>
                <PixelSprite layers={[p.sprite]} scale={1.6} />
                <div className="f1">
                  <div className="t" style={{ fontSize: 17, color: 'var(--ink)' }}>{tx(p.name)}</div>
                  <div className="pixel" style={{ fontSize: 6, color: 'var(--ink-3)', marginTop: 3 }}>{tx(T('Stock', 'Stock'))}: {p.stock} · {p.cost} 🎟</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { BadgesScreen, PrizesScreen, ScannerScreen, DashboardScreen });
