-- ============================================================================
-- Cloud Quest · SP3 — point corrections audit (RN-09, CA-07)
--
-- Authoritative spec: docs/specs/2026-06-21-mvp-scope-reconciled.md
--   RN-09 "El staff puede corregir puntos, pero toda corrección debe quedar
--          registrada en historial."
--   CA-07 "El staff y administrador puede corregir puntos y queda historial de
--          la corrección."
--
-- Points (participations.tickets) are awarded server-side by approve_completion.
-- A correction adjusts that running total to a new absolute value AND must leave
-- an immutable audit trail: the original history is NEVER deleted, every
-- correction appends a new row. Corrections are server-side only (SECURITY
-- DEFINER), authorized as admin OR staff-of-that-event — the same authorization
-- model approve_completion uses (staff_assignments), never a client write grant.
--
-- Apply via Supabase migration tooling. Assumes 0001_sp1_foundation.sql and
-- 0003_completions.sql are live.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- point_corrections — immutable audit ledger of every ticket adjustment.
--
-- One row per correction. `points_before`/`points_after` snapshot the
-- participation's ticket balance around the change and `delta` is the signed
-- difference, so the full history of a participation reconstructs without
-- joining anything else. `reason` is mandatory (RN-09: every correction is
-- justified). Rows are append-only: there is NO update/delete client grant and
-- the writing RPC only ever inserts.
--
-- RLS: an admin reads every row; the owning player reads their own corrections.
-- staff-of-event read access for the console is served by list_point_corrections
-- (SECURITY DEFINER) so RLS stays narrow. There is NO client write path.
-- ----------------------------------------------------------------------------
create table public.point_corrections (
  id               uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.participations(id) on delete cascade,
  points_before    int  not null,
  points_after     int  not null,
  delta            int  not null,
  reason           text not null,
  corrected_by     uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);
alter table public.point_corrections enable row level security;

create index on public.point_corrections (participation_id);
create index on public.point_corrections (corrected_by);

-- Admins may read every correction (audit tooling).
create policy point_corrections_admin_select on public.point_corrections
  for select to authenticated
  using (public.is_admin());

-- A player may read corrections on their own participation.
create policy point_corrections_select_own on public.point_corrections
  for select to authenticated
  using (
    participation_id in (
      select id from public.participations where player_id = auth.uid()
    )
  );

-- Read-only for clients; writes go exclusively through correct_points().
grant select on public.point_corrections to authenticated;

-- ----------------------------------------------------------------------------
-- correct_points — the single server-side entry point for adjusting tickets.
--
-- SECURITY DEFINER so it can write participations + the audit ledger despite the
-- revoked client write grants; authorization lives in the body (admin OR a
-- staff_assignments row for the participation's event), not in the grant.
--
-- Validation / effect order:
--   1. require a non-blank reason (22023) and a non-negative new total (22023).
--   2. resolve the participation -> its event_id + current tickets (= before);
--      unknown participation -> P0002.
--   3. authorize: is_admin() OR caller staffs that event; else 42501.
--   4. set participations.tickets = p_new_tickets.
--   5. append a point_corrections row (before, after, delta, reason, corrected_by).
--   6. return { ok, before, after, delta }.
-- The original audit history is never touched — only inserts happen here.
-- ----------------------------------------------------------------------------
create or replace function public.correct_points(
  p_participation_id uuid,
  p_new_tickets int,
  p_reason text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_event_id uuid;
  v_before   int;
  v_delta    int;
begin
  -- 1. validate inputs before any read or write
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a correction reason is required' using errcode = '22023';
  end if;

  if p_new_tickets is null or p_new_tickets < 0 then
    raise exception 'new ticket total must be zero or greater' using errcode = '22023';
  end if;

  -- 2. resolve the participation's event + current balance (= before)
  select p.event_id, p.tickets
    into v_event_id, v_before
  from public.participations p
  where p.id = p_participation_id;

  if v_event_id is null then
    raise exception 'unknown participation' using errcode = 'P0002';
  end if;

  -- 3. authorize: admin, or staff assigned to this participation's event
  if not public.is_admin() and not exists (
    select 1 from public.staff_assignments sa
    where sa.staff_id = v_caller
      and sa.event_id = v_event_id
  ) then
    raise exception 'not authorized to correct points for this event'
      using errcode = '42501';
  end if;

  v_delta := p_new_tickets - v_before;

  -- 4. apply the new absolute total
  update public.participations
    set tickets = p_new_tickets
  where id = p_participation_id;

  -- 5. append the audit row (history is append-only; never deleted)
  insert into public.point_corrections (
    participation_id, points_before, points_after, delta, reason, corrected_by
  ) values (
    p_participation_id, v_before, p_new_tickets, v_delta, btrim(p_reason), v_caller
  );

  -- 6. report the change
  return jsonb_build_object(
    'ok', true,
    'before', v_before,
    'after', p_new_tickets,
    'delta', v_delta
  );
end;
$$;

grant execute on function public.correct_points(uuid, int, text) to authenticated;

-- ----------------------------------------------------------------------------
-- list_point_corrections — read the audit history for a participation.
--
-- SECURITY DEFINER so the staff console can see corrections without widening the
-- RLS on point_corrections. Authorization mirrors correct_points (admin OR
-- staff-of-event) and also allows the owning player to read their own history.
-- Returns rows newest-first, enriched with the corrector's username.
-- ----------------------------------------------------------------------------
create or replace function public.list_point_corrections(
  p_participation_id uuid
)
returns table (
  id            uuid,
  points_before int,
  points_after  int,
  delta         int,
  reason        text,
  corrected_by  uuid,
  corrector_name text,
  created_at    timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_event_id uuid;
  v_player   uuid;
begin
  select p.event_id, p.player_id
    into v_event_id, v_player
  from public.participations p
  where p.id = p_participation_id;

  if v_event_id is null then
    raise exception 'unknown participation' using errcode = 'P0002';
  end if;

  if not public.is_admin()
     and v_caller is distinct from v_player
     and not exists (
       select 1 from public.staff_assignments sa
       where sa.staff_id = v_caller
         and sa.event_id = v_event_id
     ) then
    raise exception 'not authorized to view this correction history'
      using errcode = '42501';
  end if;

  return query
    select pc.id, pc.points_before, pc.points_after, pc.delta, pc.reason,
           pc.corrected_by, prof.username, pc.created_at
    from public.point_corrections pc
    left join public.profiles prof on prof.id = pc.corrected_by
    where pc.participation_id = p_participation_id
    order by pc.created_at desc;
end;
$$;

grant execute on function public.list_point_corrections(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- find_participation_for_correction — look a participant up by their QR token.
--
-- The admin console resolves a player's participation (id + current balance)
-- before correcting. participations is owner-only under RLS, so this SECURITY
-- DEFINER lookup is the authorized read path: admin OR staff-of-event only.
-- Returns { participation_id, player_id, player_name, tickets, event_id,
-- event_name }; unknown token/participation -> P0002.
-- ----------------------------------------------------------------------------
create or replace function public.find_participation_for_correction(
  p_qr_token text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_player_id    uuid;
  v_player_name  text;
  v_participation uuid;
  v_tickets      int;
  v_event_name   text;
begin
  -- authorize: admin, or staff assigned to the target event
  if not public.is_admin() and not exists (
    select 1 from public.staff_assignments sa
    where sa.staff_id = v_caller
      and sa.event_id = p_event_id
  ) then
    raise exception 'not authorized to look up participants for this event'
      using errcode = '42501';
  end if;

  select p.id, p.username
    into v_player_id, v_player_name
  from public.profiles p
  where p.qr_token = p_qr_token;

  if v_player_id is null then
    raise exception 'unknown player' using errcode = 'P0002';
  end if;

  select pa.id, pa.tickets
    into v_participation, v_tickets
  from public.participations pa
  where pa.player_id = v_player_id and pa.event_id = p_event_id;

  if v_participation is null then
    raise exception 'player has no participation in this event' using errcode = 'P0002';
  end if;

  select e.name into v_event_name from public.events e where e.id = p_event_id;

  return jsonb_build_object(
    'participation_id', v_participation,
    'player_id', v_player_id,
    'player_name', v_player_name,
    'tickets', v_tickets,
    'event_id', p_event_id,
    'event_name', v_event_name
  );
end;
$$;

grant execute on function public.find_participation_for_correction(text, uuid) to authenticated;
