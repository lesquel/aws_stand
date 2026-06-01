'use client';

import { useGame } from '@/presentation/state/game-provider';
import { MapScreen } from '@/presentation/screens/core';

export default function HomePage() {
  const { lang, nav, progress, player } = useGame();
  return <MapScreen lang={lang} nav={nav} progress={progress} player={player!} />;
}
