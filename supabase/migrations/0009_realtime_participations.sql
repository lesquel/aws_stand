-- ============================================================================
-- Cloud Quest · SP3 polish — live-refresh the player's screen after a scan.
--
-- Background: when staff scan a player's QR, approve_completion mutates the
-- player's participations row server-side (tickets / pieces / badges /
-- done_activities). The player's own screen, however, holds that progress in
-- React state loaded at join time, so it stays stale until a manual reload.
--
-- Fix: add `participations` to the `supabase_realtime` publication so the client
-- can subscribe to postgres_changes on its own row and refetch on change.
--
-- Security note: Realtime still enforces RLS on delivery. The owner SELECT
-- policy (participations_select_own: player_id = auth.uid(), migration 0001)
-- means a subscribed client receives change events ONLY for its own row, even
-- though the client-side channel filter (player_id=eq.<uid>) already narrows it.
-- No new grants or policies are required — SELECT is already owner-scoped.
--
-- The default REPLICA IDENTITY (primary key) is sufficient here: the client only
-- needs the new row's identity to refetch; it never reads OLD column values.
--
-- Apply via Supabase migration tooling. Idempotent: re-adding a table already in
-- the publication is a no-op guarded by the catalog check below.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participations'
  ) then
    alter publication supabase_realtime add table public.participations;
  end if;
end $$;
