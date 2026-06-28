-- ============================================================================
-- Cloud Quest · SP3 — event-close winner validation (CA-08, RN-07/08/10)
--
-- Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
--   CA-08 "Al cierre, el staff puede validar top 3 y participantes con todos los
--          badges mediante QR."
--   RN-07  the top 3 by points receive the major prize.
--   RN-08  a participant with ALL badges earns an extra reward.
--   RN-10  the QR validates that the winner matches the registered account.
--
-- At close, staff/admin scan a player's QR to confirm WHO the QR belongs to and
-- WHETHER they qualify (top 3 and/or all badges). `participations` is owner-only
-- under RLS, so a staffer cannot read another player's row directly. This is the
-- authorized read path: a SECURITY DEFINER function, authorized in its body as
-- admin OR staff-of-that-event (the same model approve_completion / correct_points
-- use), that returns ONLY the eligibility "card" — never email or other PII.
--
-- Apply via Supabase migration tooling. Assumes 0001_sp1_foundation.sql is live.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- validate_winner — resolve + score a scanned player for the event-close prizes.
--
-- SECURITY DEFINER so it can read every participation despite owner-only RLS;
-- authorization lives in the body (admin OR a staff_assignments row for the
-- target event), not in a grant.
--
-- Steps:
--   1. authorize: is_admin() OR caller staffs p_event_id; else 42501.
--   2. resolve the player from qr_token (RN-10: maps the QR to a real account);
--      unknown token -> P0002.
--   3. resolve that player's participation in p_event_id; not participating ->
--      P0002.
--   4. compute the eligibility card:
--        - tickets         : the participation's accumulated points.
--        - badges_count    : length of the participation's `badges` jsonb array.
--        - total_badges    : badges whose activity's stand belongs to the event.
--        - has_all_badges  : badges_count >= total_badges AND total_badges > 0.
--        - rank            : 1-based position by the SAME ordering as
--                            event_leaderboard (tickets desc, joined_at asc,
--                            username asc) — fully deterministic.
--        - is_top3         : rank <= 3.
--   5. return the card as jsonb. Scoring is read-only; nothing is mutated.
-- ----------------------------------------------------------------------------
create or replace function public.validate_winner(
  p_qr_token text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller        uuid := auth.uid();
  v_player_id     uuid;
  v_player_name   text;
  v_tickets       int;
  v_badges_count  int;
  v_total_badges  int;
  v_has_all       boolean;
  v_rank          int;
begin
  -- 1. authorize: admin, or staff assigned to the target event
  if not public.is_admin() and not exists (
    select 1 from public.staff_assignments sa
    where sa.staff_id = v_caller
      and sa.event_id = p_event_id
  ) then
    raise exception 'not authorized to validate winners for this event'
      using errcode = '42501';
  end if;

  -- 2. resolve the player from their QR token (RN-10)
  select p.id, p.username
    into v_player_id, v_player_name
  from public.profiles p
  where p.qr_token = p_qr_token;

  if v_player_id is null then
    raise exception 'unknown player' using errcode = 'P0002';
  end if;

  -- 3. resolve their participation in this event
  select coalesce(jsonb_array_length(pa.badges), 0), pa.tickets
    into v_badges_count, v_tickets
  from public.participations pa
  where pa.player_id = v_player_id and pa.event_id = p_event_id;

  if v_tickets is null then
    raise exception 'player has no participation in this event' using errcode = 'P0002';
  end if;

  -- 4a. total badges available in the event (badge -> activity -> stand -> event)
  select count(*)::int
    into v_total_badges
  from public.badges b
  join public.activities a on a.id = b.activity_id
  join public.stands s on s.id = a.stand_id
  where s.event_id = p_event_id;

  v_has_all := v_badges_count >= v_total_badges and v_total_badges > 0;

  -- 4b. 1-based rank using the exact event_leaderboard ordering
  select ranked.rk
    into v_rank
  from (
    select p2.player_id,
           row_number() over (
             order by p2.tickets desc, p2.joined_at asc, pr2.username asc
           )::int as rk
    from public.participations p2
    join public.profiles pr2 on pr2.id = p2.player_id
    where p2.event_id = p_event_id
  ) ranked
  where ranked.player_id = v_player_id;

  -- 5. the eligibility card the staffer sees (RN-10 identity + RN-07/08 eligibility)
  return jsonb_build_object(
    'ok', true,
    'player_id', v_player_id,
    'player_name', v_player_name,
    'tickets', v_tickets,
    'badges_count', v_badges_count,
    'total_badges', v_total_badges,
    'has_all_badges', v_has_all,
    'rank', v_rank,
    'is_top3', v_rank <= 3
  );
end;
$$;

grant execute on function public.validate_winner(text, uuid) to authenticated;
