'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { Register } from '@/presentation/screens/onboard';

export default function RegisterPage() {
  const { lang, nav, player, signUp, authError, confirmPending } = useGame();
  const router = useRouter();

  // If already logged in, redirect to the role's home screen.
  useEffect(() => {
    if (player) {
      const dest = player.role === 'admin' ? '/admin' : player.role === 'staff' ? '/staff' : '/home';
      router.replace(dest);
    }
  }, [player, router]);

  if (player) return null;

  return <Register lang={lang} nav={nav} signUp={signUp} authError={authError} confirmPending={confirmPending} />;
}
