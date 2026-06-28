'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/presentation/state/game-provider';
import { T } from '@/domain/i18n';

/**
 * Admin route guard (SP1 Slice 6).
 *
 * The full admin console is SP2 — this route only proves the guard + role
 * plumbing. Non-admins never see admin content: unauthenticated visitors are
 * sent to /login, and authenticated non-admins (player/staff) are sent to /home.
 * Only a profile whose app role is 'admin' renders the placeholder.
 *
 * Render-gating here is UX only; the database enforces real admin access via
 * the is_admin() RLS policies. This page never reads privileged data.
 */
export default function AdminPage() {
  const { lang, player, authLoading } = useGame();
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
  // flash of the admin placeholder before the redirect runs).
  if (authLoading || !isAdmin) return null;

  const tx = (o: { es: string; en: string }) => o[lang];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div
          className="pixel"
          style={{ fontSize: 12, color: 'var(--orange)', letterSpacing: 2, marginBottom: 16 }}
        >
          {tx(T('ADMIN', 'ADMIN'))}
        </div>
        <p className="t" style={{ color: 'var(--ink)' }}>
          {tx(T('Panel de administración — próximamente', 'Admin panel — coming soon'))}
        </p>
        <p className="t sm" style={{ color: 'var(--ink-3)', marginTop: 10 }}>
          {tx(T('La consola completa llega en SP2.', 'The full console arrives in SP2.'))}
        </p>
      </div>
    </div>
  );
}
