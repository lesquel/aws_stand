'use client';

import { useGame } from '@/presentation/state/game-provider';
import { BadgesScreen } from '@/presentation/screens/meta';

export default function BadgesPage() {
  const { lang, progress } = useGame();
  return <BadgesScreen lang={lang} progress={progress} />;
}
