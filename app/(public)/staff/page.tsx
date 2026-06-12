'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { StaffScreen } from '@/presentation/screens/staff';

export default function StaffPage() {
  const { lang, nav, player, becomeStaff, changeStand } = useGame();
  const router = useRouter();

  // Not logged in → redirect to login
  useEffect(() => {
    if (!player) router.replace('/login');
  }, [player, router]);

  if (!player) return null;

  return <StaffScreen lang={lang} nav={nav} player={player} becomeStaff={becomeStaff} changeStand={changeStand} />;
}
