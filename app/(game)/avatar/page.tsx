'use client';

import { useGame } from '@/presentation/state/game-provider';
import { AvatarScreen } from '@/presentation/screens/core';

export default function AvatarPage() {
  const { lang, nav, progress, player } = useGame();
  return <AvatarScreen lang={lang} nav={nav} progress={progress} player={player!} />;
}
