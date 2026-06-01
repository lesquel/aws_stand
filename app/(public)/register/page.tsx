'use client';

import { useGame } from '@/presentation/state/game-provider';
import { Register } from '@/presentation/screens/onboard';

export default function RegisterPage() {
  const { lang, nav, onCreate } = useGame();
  return <Register lang={lang} nav={nav} onCreate={onCreate} />;
}
