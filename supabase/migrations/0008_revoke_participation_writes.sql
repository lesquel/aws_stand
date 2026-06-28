-- ============================================================================
-- Cloud Quest · SP3 capstone — close the SP1 self-mutation hole.
--
-- Background: SP1 granted clients a column-level UPDATE on `participations`
-- (tickets / pieces / badges / claimed / done_activities) plus an owner RLS
-- update policy, because the original gameplay loop awarded rewards CLIENT-SIDE
-- (StandScreen "Validar" -> approveActivity -> debounced saveParticipation). A
-- player could open devtools and run `update participations set tickets = 9999`.
--
-- SP3 replaced that with the server-side staff-scan model (approve_completion),
-- and this change removes the obsolete client self-approve path entirely. With
-- no client writer left, the broad UPDATE grant and its RLS update policy are
-- pure attack surface — revoke them. After this migration `participations` is
-- mutated ONLY by SECURITY DEFINER RPCs: join_event, approve_completion,
-- correct_points, claim_prize. Clients keep SELECT (owner-scoped by RLS) only.
--
-- The old client path also awarded the stand's collectible piece (stands.piece_id);
-- approve_completion did not. To preserve the avatar album server-side, this
-- migration extends approve_completion to ALSO append the stand's piece_id to
-- participations.pieces (deduped) on a fresh award. Everything else in the RPC
-- is identical to 0003_completions.sql.
--
-- Apply via Supabase migration tooling. Assumes 0003_completions.sql is live.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- approve_completion — same contract as 0003, plus the piece award.
--
-- The only behavioral delta vs 0003 is in step 7 (fresh-award cache update):
-- we now also resolve the stand's piece_id and append it to participations.pieces
-- deduped, and only when piece_id is not null. Tickets / badge / done_activities
-- handling, idempotency (RN-02), authorization, and scoring (RN-05) are unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.approve_completion(
  p_qr_token text,
  p_activity_id uuid,
  p_position int default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_staff_id         uuid := auth.uid();
  v_stand_id         uuid;
  v_event_id         uuid;
  v_score_type       text;
  v_points_fixed     int;
  v_points_first     int;
  v_points_second    int;
  v_points_third     int;
  v_player_id        uuid;
  v_player_name      text;
  v_participation_id uuid;
  v_badge_id         uuid;
  v_piece_id         text;
  v_points           int;
  v_completion_id    uuid;
begin
  -- 1. resolve activity -> stand -> event
  select a.stand_id, a.score_type, a.points_fixed,
         a.points_first, a.points_second, a.points_third
    into v_stand_id, v_score_type, v_points_fixed,
         v_points_first, v_points_second, v_points_third
  from public.activities a
  where a.id = p_activity_id;

  if v_stand_id is null then
    raise exception 'unknown activity' using errcode = 'P0002';
  end if;

  select s.event_id into v_event_id
  from public.stands s
  where s.id = v_stand_id;

  -- 2. authorize: caller must staff this stand at this event
  if not exists (
    select 1 from public.staff_assignments sa
    where sa.staff_id = v_staff_id
      and sa.stand_id = v_stand_id
      and sa.event_id = v_event_id
  ) then
    raise exception 'not staff of this stand' using errcode = '42501';
  end if;

  -- 3. resolve player from QR token
  select p.id, p.username
    into v_player_id, v_player_name
  from public.profiles p
  where p.qr_token = p_qr_token;

  if v_player_id is null then
    raise exception 'unknown player' using errcode = 'P0002';
  end if;

  -- 4. ensure participation (auto-join on first scan -> clean ledger)
  insert into public.participations (player_id, event_id)
  values (v_player_id, v_event_id)
  on conflict (player_id, event_id) do nothing
  returning id into v_participation_id;

  if v_participation_id is null then
    select id into v_participation_id
    from public.participations
    where player_id = v_player_id and event_id = v_event_id;
  end if;

  -- 5. points by score type (RN-05)
  if v_score_type = 'position' then
    if p_position is null or p_position not in (1, 2, 3) then
      raise exception 'position must be 1, 2 or 3 for a position-scored activity'
        using errcode = '22023';
    end if;
    v_points := case p_position
      when 1 then v_points_first
      when 2 then v_points_second
      when 3 then v_points_third
    end;
  else
    v_points := v_points_fixed;
  end if;

  -- 6. idempotent award (RN-02): unique(participation_id, activity_id)
  insert into public.completions (
    participation_id, activity_id, stand_id, points, position, approved_by
  ) values (
    v_participation_id,
    p_activity_id,
    v_stand_id,
    v_points,
    case when v_score_type = 'position' then p_position else null end,
    v_staff_id
  )
  on conflict (participation_id, activity_id) do nothing
  returning id into v_completion_id;

  if v_completion_id is null then
    -- already awarded: warn the staffer, do NOT re-award or double the cache
    return jsonb_build_object(
      'ok', true,
      'already_awarded', true,
      'points', 0,
      'player_name', v_player_name
    );
  end if;

  -- 7. fresh award: keep the participation cache in sync.
  --    tickets += points; badge, done_activities and the stand's collectible
  --    piece are appended deduped. The piece keeps the avatar album server-side
  --    now that the client self-approve path is gone (pieces earned via scan only).
  select b.id into v_badge_id
  from public.badges b
  where b.activity_id = p_activity_id;

  select s.piece_id into v_piece_id
  from public.stands s
  where s.id = v_stand_id;

  update public.participations p set
    tickets = p.tickets + v_points,
    done_activities = case
      when p.done_activities ? p_activity_id::text then p.done_activities
      else p.done_activities || to_jsonb(p_activity_id::text)
    end,
    badges = case
      when v_badge_id is null then p.badges
      when p.badges ? v_badge_id::text then p.badges
      else p.badges || to_jsonb(v_badge_id::text)
    end,
    pieces = case
      when v_piece_id is null then p.pieces
      when p.pieces ? v_piece_id then p.pieces
      else p.pieces || to_jsonb(v_piece_id)
    end
  where p.id = v_participation_id;

  return jsonb_build_object(
    'ok', true,
    'already_awarded', false,
    'points', v_points,
    'player_name', v_player_name
  );
end;
$$;

grant execute on function public.approve_completion(text, uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- Revoke every client write path on participations.
--
-- REVOKE UPDATE removes the table-level privilege; the explicit column-level
-- REVOKE removes the SP1 `update (tickets, ...)` column grant (a table-level
-- revoke does not clear column-level grants in PostgreSQL). Dropping the update
-- policy removes the RLS rule that paired with that grant. SELECT stays (owner
-- RLS), and all writes now flow exclusively through the SECURITY DEFINER RPCs.
-- ----------------------------------------------------------------------------
revoke update (tickets, pieces, badges, claimed, done_activities)
  on public.participations from authenticated;
revoke update on public.participations from authenticated;

drop policy if exists participations_update_own on public.participations;
