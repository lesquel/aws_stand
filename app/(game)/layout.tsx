'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PixelSprite } from '@/presentation/components/sprites';
import { T } from '@/domain/i18n';
import { useGame } from '@/presentation/state/game-provider';

const tabs = [
  { id: 'home', ic: 'ic_compass', label: T('Mapa', 'Map') },
  { id: 'avatar', ic: 'buddy', label: T('Avatar', 'Avatar') },
  { id: 'badges', ic: 'ic_medal', label: T('Insignias', 'Badges') },
  { id: 'prizes', ic: 'ticket', label: T('Premios', 'Prizes') },
];

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const { player, progress, nav, lang } = useGame();
  const pathname = usePathname();
  const router = useRouter();
  const tx = (o: { es: string; en: string }) => o[lang];

  // Redirect to register if no player (router is stable, so deps are clean)
  useEffect(() => {
    if (!player) router.replace('/register');
  }, [player, router]);

  if (!player) return null;

  // Derive active tab from pathname: /home → 'home', /avatar → 'avatar', etc.
  const activeTab = pathname.split('/')[1] ?? '';

  return (
    <>
      <div className="appbar">
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => nav('home')}>
          <PixelSprite layers={['ic_cloud']} scale={1.6} /> CLOUD<b>QUEST</b>
        </div>
        <div className="coin" style={{ fontSize: 11, marginRight: 116 }}>
          <PixelSprite layers={['ticket']} scale={1.8} /> {progress.tickets}
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 0, top: 56, bottom: 64 }}>
        {children}
      </div>

      <div className="tabbar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}>
        {tabs.map(tab => {
          const on = activeTab === tab.id;
          return (
            <button key={tab.id} className={'tab' + (on ? ' on' : '')} onClick={() => nav(tab.id)}>
              <span className="ic" style={{ opacity: on ? 1 : .6 }}><PixelSprite layers={[tab.ic]} scale={1.5} /></span>
              {tx(tab.label)}
            </button>
          );
        })}
      </div>
    </>
  );
}
