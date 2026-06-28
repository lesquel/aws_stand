'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { StaffScreen } from '@/presentation/screens/staff';

export default function StaffPage() {
  const { lang, nav, getStaffAssignments, approveCompletion, authLoading, player } = useGame();
  const router = useRouter();

  // Not logged in → redirect to login (wait for auth to settle first)
  useEffect(() => {
    if (authLoading) return; // wait for auth before deciding
    if (!player) router.replace('/login');
  }, [player, authLoading, router]);

  if (authLoading || !player) return null;

  return (
    <StaffScreen
      lang={lang}
      nav={nav}
      getStaffAssignments={getStaffAssignments}
      approveCompletion={approveCompletion}
    />
  );
}
