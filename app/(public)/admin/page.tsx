'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { AdminConsole } from '@/presentation/screens/admin/admin-console';

/**
 * Admin route guard + console host (SP2 Slice 1+2).
 *
 * The guard is unchanged from SP1: unauthenticated visitors go to /login,
 * authenticated non-admins (player/staff) go to /home, and only an `admin`
 * profile renders the console. Render-gating here is UX only — the database
 * enforces real admin access via the is_admin() RLS policies, so the console's
 * reads/writes are safe even if this guard were bypassed.
 */
export default function AdminPage() {
  const { player, authLoading } = useGame();
  const router = useRouter();
  const isAdmin = player?.role === 'admin';

  useEffect(() => {
    if (authLoading) return; // wait for auth to settle before deciding
    if (!player) {
      router.replace('/login');
      return;
    }
    if (player.role !== 'admin') {
      router.replace('/home');
    }
  }, [player, authLoading, router]);

  // Render nothing while auth is loading or for any non-admin (prevents a
  // flash of admin content before the redirect runs).
  if (authLoading || !isAdmin) return null;

  return <AdminConsole />;
}
