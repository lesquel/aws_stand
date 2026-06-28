-- ============================================================================
-- Cloud Quest · SP3 — completions ledger + approve_completion RPC
--
-- Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
--   (RN-02: points + badge once per activity; re-scan warns "already participated")
--   (RN-05: points are fixed or by position, per activity)
-- Design: docs/specs/2026-06-18-sp3-staff-scan-completions-design.md
--
-- This is the server-side scoring backbone for the staff-scan flow. A staff
-- member assigned to an (event + stand) registers players who completed that
-- stand's activity by scanning the player's QR (profiles.qr_token). All scoring
-- is server-side and authorized by `staff_assignments` (no shared secret in the
-- client). The `completions` ledger is the source of truth; the participation
-- columns (tickets / badges / done_activities) are a denormalized cache the RPC
-- keeps in sync on each fresh award.
--
-- Apply via Supabase migration tooling. Assumes 0001_sp1_foundation.sql is live.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- completions — per-activity award ledger, event-scoped via participation.
--
-- unique(participation_id, activity_id) enforces RN-02 idempotency at the DB
-- level: one award per activity per participation, no matter how many times a
-- staffer scans. `points` and `position` are snapshotted at award time so a
-- later catalog edit never retroactively rewrites history.
--
-- RLS: a player reads only their own completions; admins read all. There is NO
-- client write path — only approve_completion() (SECURITY DEFINER) inserts. The
-- absence of insert/update/delete grants to `authenticated` is the hard lock;
-- RLS scopes the reads on top of that.
-- ----------------------------------------------------------------------------
create table public.completions (
  id               uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.participations(id) on delete cascade,
  activity_id      uuid not null references public.activities(id),
  stand_id         uuid not null references public.stands(id),
  points           int  not null,
  position         int,
  approved_by      uuid not null references public.profiles(id),
  awarded_at       timestamptz not null default now(),
  unique (participation_id, activity_id)
);
alter table public.completions enable row level security;

create index on public.completions (participation_id);
create index on public.completions (activity_id);
create index on public.completions (approved_by);

-- A player may read their own completions (joined to their participations).
create policy completions_select_own on public.completions
  for select to authenticated
  using (
    participation_id in (
      select id from public.participations where player_id = auth.uid()
    )
  );

-- Admins may read every completion (audit / leaderboard tooling).
create policy completions_admin_select on public.completions
  for select to authenticated
  using (public.is_admin());

-- Read-only for clients; writes go exclusively through approve_completion().
grant select on public.completions to authenticated;

-- ----------------------------------------------------------------------------
-- approve_completion — the single server-side scoring entry point.
--
-- SECURITY DEFINER so it can write `completions` and the participation cache
-- despite the revoked client write grants; authorization lives in the body
-- (a matching staff_assignments row), not in the grant. EXECUTE is granted to
-- `authenticated` for exactly that reason.
--
-- Validation / effect order:
--   1. resolve activity -> its stand -> that stand's event.
--   2. authorize: require a staff_assignments row for the caller on that
--      (stand, event); else raise 42501 (cross-event isolation by construction).
--   3. resolve the player from qr_token; unknown -> P0002.
--   4. ensure participation (auto-join on first scan, clean ledger).
--   5. points: 'fixed' -> points_fixed; 'position' -> points_first/second/third
--      (p_position must be 1, 2 or 3).
--   6. insert the completion `on conflict do nothing` (RN-02 idempotency). On a
--      conflict (already awarded) return already_awarded:true WITHOUT re-awarding.
--   7. on a fresh award, update the participation cache: tickets += points,
--      append the badge id (if any) and the activity id (deduped).
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

  -- 7. fresh award: keep the participation cache in sync
  select b.id into v_badge_id
  from public.badges b
  where b.activity_id = p_activity_id;

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
