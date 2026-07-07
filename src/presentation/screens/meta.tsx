'use client';

/* ============================================================
   Presentation · Meta screens — Badges, Prizes
   ============================================================ */

import { T } from '../../domain/i18n';
import { BADGES } from '../../domain/badges';
import { useGame } from '../state/game-provider';
import { Card, Btn } from '../components/ui-kit';
import { PixelSprite } from '../components/sprites';
import type { Lang, Progress, Actions, Localized } from '../../domain/types';

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

