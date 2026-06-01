'use client';

import { useGame } from '@/presentation/state/game-provider';
import { PrizesScreen } from '@/presentation/screens/meta';

export default function PrizesPage() {
  const { lang, progress, actions } = useGame();
  return <PrizesScreen lang={lang} progress={progress} actions={actions} />;
}
