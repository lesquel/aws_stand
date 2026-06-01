'use client';

import { useGame } from '@/presentation/state/game-provider';
import { ScannerScreen } from '@/presentation/screens/meta';

export default function ScannerPage() {
  const { lang, nav, progress, actions, player } = useGame();
  return (
    <ScannerScreen
      lang={lang}
      nav={nav}
      progress={progress}
      actions={actions}
      player={player ?? { name: 'Demo', baseId: 'explorer' }}
    />
  );
}
