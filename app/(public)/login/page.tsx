'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { Login } from '@/presentation/screens/login';

export default function LoginPage() {
  const { lang, nav, player, signIn, authError } = useGame();
  const router = useRouter();

  // If already logged in, redirect to appropriate screen
  useEffect(() => {
    if (player) {
      router.replace(player.role === 'staff' ? '/staff' : '/home');
    }
  }, [player, router]);

  if (player) return null;

  return <Login lang={lang} nav={nav} signIn={signIn} authError={authError} />;
}
