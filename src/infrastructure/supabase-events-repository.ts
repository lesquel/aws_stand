/* ============================================================
   Infrastructure · Supabase events read repository
   Lists the active events a player may join/select. RLS exposes only
   `status = 'active'` events to the `authenticated` role, so an authenticated
   read already returns the joinable set.

   Used by the provider's event-selection flow: exactly one active event →
   auto-select (single-event feel); multiple → present a minimal picker.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActiveEvent {
  id: string;
  slug: string;
  name: string;
}

/** Active, joinable events ordered by creation (stable auto-select order). */
export async function fetchActiveEvents(supabase: SupabaseClient): Promise<ActiveEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id,slug,name')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActiveEvent[];
}
