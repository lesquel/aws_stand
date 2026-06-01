'use client';

import { useGame } from '@/presentation/state/game-provider';
import { Landing } from '@/presentation/screens/onboard';

export default function LandingPage() {
  const { lang, nav, heroLayout } = useGame();
  return <Landing lang={lang} nav={nav} layout={heroLayout} />;
}
