'use client';

import { useParams } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { StandScreen } from '@/presentation/screens/core';

export default function StandPage() {
  const { standId } = useParams() as { standId: string };
  const { lang, nav, progress, actions, player } = useGame();
  return (
    <StandScreen
      lang={lang}
      nav={nav}
      standId={standId}
      progress={progress}
      actions={actions}
      player={player!}
    />
  );
}
