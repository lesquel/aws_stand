'use client';

/* ============================================================
   Presentation · Meta screens — Badges, Prizes, Dashboard
   ============================================================ */

import { T } from '../../domain/i18n';
import { BADGES } from '../../domain/badges';
import { PIECES } from '../../domain/catalog';
import { useGame } from '../state/game-provider';
import { Card, Btn } from '../components/ui-kit';
import { PixelSprite } from '../components/sprites';
import type { Lang, Nav, Progress, Actions, Localized } from '../../domain/types';

interface BadgesScreenProps { lang: Lang; progress: Progress; }
/* ---------------- BADGES ---------------- */
export function BadgesScreen({ lang, progress }: BadgesScreenProps) {
  const tx = (o: Localized) => o[lang];
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

interface PrizesScreenProps { lang: Lang; progress: Progress; actions: Actions; }
/* ---------------- PRIZES ---------------- */
export function PrizesScreen({ lang, progress, actions }: PrizesScreenProps) {
  const tx = (o: Localized) => o[lang];
  const { prizes } = useGame();
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
          {prizes.map(pz => {
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

interface DashboardScreenProps { lang: Lang; nav: Nav; progress: Progress; }
/* ---------------- ORGANIZER DASHBOARD ---------------- */
export function DashboardScreen({ lang, nav, progress }: DashboardScreenProps) {
  const tx = (o: Localized) => o[lang];
  const { stands, prizes } = useGame();
  // mock aggregate data + live player's contribution
  const baseVisits: Record<string, number> = { cloud: 184, ia: 156, sec: 132, crew: 171, build: 98 };
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
              {stands.map(s => {
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
              {stands.map(s => (
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
            {prizes.map(p => (
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
