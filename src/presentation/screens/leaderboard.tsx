'use client';

/* ============================================================
   Presentation · Leaderboard screen — per-event public ranking
   Reads the current event's ranking (RN-06: tickets desc, time
   tiebreak) via the `event_leaderboard` RPC and highlights the
   signed-in player's row. Reachable by participants and staff.
   ============================================================ */

import { useEffect, useState } from 'react';
import { T } from '../../domain/i18n';
import { useGame } from '../state/game-provider';
import { Card } from '../components/ui-kit';
import { PixelSprite } from '../components/sprites';
import { getSupabase } from '../../infrastructure/supabase-client';
import { fetchLeaderboard, type LeaderboardEntry } from '../../infrastructure/supabase-leaderboard-repository';
import type { Localized } from '../../domain/types';

type LoadState = 'loading' | 'ready' | 'error';

export function LeaderboardScreen() {
  const { lang, player, selectedEventId } = useGame();
  const tx = (o: Localized) => o[lang];

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !selectedEventId) {
      setState('ready');
      setEntries([]);
      return;
    }
    let active = true;
    setState('loading');
    fetchLeaderboard(supabase, selectedEventId)
      .then((rows) => {
        if (!active) return;
        setEntries(rows);
        setState('ready');
      })
      .catch((err) => {
        console.warn('[fetchLeaderboard] failed:', err);
        if (!active) return;
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [selectedEventId]);

  return (
    <div className="screen scr-anim">
      <div className="wrap">
        <div className="eyebrow">{tx(T('Clasificación', 'Standings'))}</div>
        <h2 className="h1" style={{ marginTop: 6 }}>{tx(T('Tabla de posiciones', 'Leaderboard'))}</h2>

        {state === 'loading' && (
          <p className="t sm center-txt mt20">{tx(T('Cargando...', 'Loading...'))}</p>
        )}

        {state === 'error' && (
          <p className="t sm center-txt mt20" style={{ color: 'var(--orange)' }}>
            {tx(T('No se pudo cargar la clasificación.', 'Could not load the leaderboard.'))}
          </p>
        )}

        {state === 'ready' && entries.length === 0 && (
          <p className="t sm center-txt mt20">
            {tx(T('Todavía no hay puntajes. ¡Completá actividades para aparecer aquí!', 'No scores yet. Complete activities to show up here!'))}
          </p>
        )}

        {state === 'ready' && entries.length > 0 && (
          <div className="col mt20" style={{ gap: 8 }}>
            {entries.map((e) => {
              const isMe = !!player && e.username === player.name;
              return (
                <Card
                  key={e.playerId}
                  flat
                  style={{
                    padding: 12,
                    borderColor: isMe ? 'var(--yellow)' : 'var(--line)',
                    background: isMe ? 'var(--bg-2)' : 'var(--panel)',
                  }}
                >
                  <div className="row center" style={{ gap: 12 }}>
                    <span
                      className="pixel"
                      style={{ fontSize: 14, width: 36, textAlign: 'right', color: rankColor(e.rank) }}
                    >
                      {e.rank}
                    </span>
                    <div className="f1">
                      <div className="t" style={{ color: 'var(--ink)' }}>
                        {e.username}
                        {isMe && (
                          <span className="pixel" style={{ fontSize: 7, color: 'var(--yellow)', marginLeft: 8 }}>
                            {tx(T('TÚ', 'YOU'))}
                          </span>
                        )}
                      </div>
                      <div className="pixel" style={{ fontSize: 7, color: 'var(--ink-3)', marginTop: 4 }}>
                        <PixelSprite layers={['ic_medal']} scale={1.2} /> {e.badgesCount} {tx(T('insignias', 'badges'))}
                      </div>
                    </div>
                    <span className="coin" style={{ fontSize: 12 }}>
                      <PixelSprite layers={['ticket']} scale={1.8} /> {e.tickets}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Podium tint for the top three positions; neutral ink otherwise. */
function rankColor(rank: number): string {
  if (rank === 1) return 'var(--yellow)';
  if (rank === 2) return 'var(--cyan)';
  if (rank === 3) return 'var(--orange)';
  return 'var(--ink-2)';
}
