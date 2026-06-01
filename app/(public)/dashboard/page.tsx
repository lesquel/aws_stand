'use client';

import { useGame } from '@/presentation/state/game-provider';
import { DashboardScreen } from '@/presentation/screens/meta';

export default function DashboardPage() {
  const { lang, nav, progress } = useGame();
  return <DashboardScreen lang={lang} nav={nav} progress={progress} />;
}
