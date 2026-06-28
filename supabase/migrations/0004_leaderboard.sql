-- ============================================================================
-- Cloud Quest · SP3 — per-event public leaderboard
--
-- Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
--   (RN-06: ranking ordered by accumulated points desc; time as tiebreak)
--   (CA-06: the ranking is visible to participants AND staff)
--
-- `participations` carries owner-only RLS (a player can read only their own
-- row), so a direct client query can never assemble a cross-player ranking.
-- The ranking is therefore exposed through a SECURITY DEFINER function that
-- returns ONLY the public ranking fields (username + tickets + badges_count) —
-- never email or any other PII.
--
-- Apply via Supabase migration tooling. Assumes 0001_sp1_foundation.sql is live.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- event_leaderboard — public, ranked standings for a single event.
--
-- SECURITY DEFINER so it can read every participation despite the owner-only
-- RLS on `participations`; it deliberately projects a narrow public shape, so
-- bypassing RLS here leaks nothing beyond the intended ranking columns.
--
-- Visibility rule: rankings are only meaningful for a running event, so the
-- function returns rows only when the event's status = 'active'. For any other
-- status (draft / archived) it returns an EMPTY set rather than raising — an
-- error would let a caller distinguish "no such event" from "event not active",
-- leaking event existence. Empty is the privacy-preserving choice.
--
-- Ordering (RN-06): tickets desc, then earliest joined_at (time tiebreak),
-- then username for a fully deterministic order. `row_number()` yields a strict
-- 1-based position given that deterministic ordering. `badges_count` is the
-- length of the participation's `badges` jsonb array.
-- ----------------------------------------------------------------------------
create or replace function public.event_leaderboard(p_event_id uuid)
returns table (
  rank         int,
  player_id    uuid,
  username     text,
  tickets      int,
  badges_count int
)
language sql
stable
security definer set search_path = public
as $$
  select
    row_number() over (
      order by p.tickets desc, p.joined_at asc, pr.username asc
    )::int                          as rank,
    pr.id                           as player_id,
    pr.username                     as username,
    p.tickets                       as tickets,
    coalesce(jsonb_array_length(p.badges), 0)::int as badges_count
  from public.participations p
  join public.profiles pr on pr.id = p.player_id
  join public.events  e  on e.id = p.event_id
  where p.event_id = p_event_id
    and e.status = 'active'
  order by p.tickets desc, p.joined_at asc, pr.username asc;
$$;

grant execute on function public.event_leaderboard(uuid) to authenticated;
