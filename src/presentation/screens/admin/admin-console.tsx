'use client';

/* ============================================================
   Presentation · Admin · Console shell

   The real /admin layout (replaces the SP1 placeholder). Header + section nav
   styled with the existing pixel UI kit. Eventos, Stands, Premios and Staff are
   all live (SP2).

   The admin guard (redirect non-admins, gate on authLoading) stays in the route
   page — this component assumes it only renders for a signed-in admin.
   ============================================================ */

import { useState } from 'react';
import { useGame } from '../../state/game-provider';
import { T } from '../../../domain/i18n';
import type { Lang, Localized } from '../../../domain/types';
import { EventsSection } from './events-section';
import { StandsSection } from './stands-section';
import { PrizesSection } from './prizes-section';
import { StaffSection } from './staff-section';
import { CorrectionsSection } from './corrections-section';

type SectionId = 'events' | 'stands' | 'prizes' | 'staff' | 'corrections';

interface NavItem {
  id: SectionId;
  label: Localized;
  enabled: boolean;
}

const NAV: readonly NavItem[] = [
  { id: 'events', label: T('Eventos', 'Events'), enabled: true },
  { id: 'stands', label: T('Stands', 'Stands'), enabled: true },
  { id: 'prizes', label: T('Premios', 'Prizes'), enabled: true },
  { id: 'staff', label: T('Staff', 'Staff'), enabled: true },
  { id: 'corrections', label: T('Correcciones', 'Corrections'), enabled: true },
];

export function AdminConsole() {
  const { lang, player, signOut } = useGame();
  const tx = (o: Localized) => o[lang];
  const [section, setSection] = useState<SectionId>('events');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        background: 'var(--bg)',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px 96px' }}>
        <header style={{ marginBottom: 28 }}>
          <div
            className="pixel"
            style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: 2 }}
          >
            {tx(T('CONSOLA', 'CONSOLE'))}
          </div>
          <h1 className="pixel" style={{ fontSize: 20, color: 'var(--ink)', marginTop: 10, lineHeight: 1.4 }}>
            {tx(T('Panel de administración', 'Admin panel'))}
          </h1>
          {player?.name && (
            <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
              {tx(T('Conectado como', 'Signed in as'))} {player.name}
              {' · '}
              <button
                type="button"
                onClick={() => void signOut()}
                className="t sm"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--cyan)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  font: 'inherit',
                }}
              >
                {tx(T('Salir', 'Sign out'))}
              </button>
            </p>
          )}
        </header>

        <nav
          aria-label={tx(T('Secciones de administración', 'Admin sections'))}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}
        >
          {NAV.map((item) => {
            const isActive = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => item.enabled && setSection(item.id)}
                className={'chip' + (isActive ? ' on' : '')}
                style={{
                  cursor: item.enabled ? 'pointer' : 'not-allowed',
                  opacity: item.enabled ? 1 : 0.45,
                }}
                title={item.enabled ? undefined : tx(T('Próximamente', 'Coming soon'))}
              >
                {tx(item.label)}
                {!item.enabled && (
                  <span style={{ marginLeft: 6, fontSize: 8 }}>
                    {tx(T('PRONTO', 'SOON'))}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {section === 'events' && <EventsSection lang={lang as Lang} />}
        {section === 'stands' && <StandsSection lang={lang as Lang} />}
        {section === 'prizes' && <PrizesSection lang={lang as Lang} />}
        {section === 'staff' && <StaffSection lang={lang as Lang} />}
        {section === 'corrections' && <CorrectionsSection lang={lang as Lang} />}
      </div>
    </div>
  );
}
