-- ============================================================================
-- Cloud Quest · SP2 — admin_upsert_stand RPC (atomic stand + activity + badge)
--
-- Problem this fixes (HIGH data-integrity bug):
-- The admin Stands repository created a stand with sequential, separate writes
-- (stand -> activity -> badge) plus a cleanup-delete on failure. If the cleanup
-- delete ALSO failed, an orphan stand (activity = null) was left behind, which
-- violates RN-03 (a stand owns exactly one activity).
--
-- Fix: do the whole thing in ONE transaction. A PL/pgSQL function body is an
-- implicit transaction: any unhandled exception rolls back EVERYTHING the
-- function did, so a failed activity/badge write can never leave a half-built
-- stand. This function intentionally does NOT catch exceptions — they must
-- propagate so the rollback happens.
--
-- Authorization: gated on public.is_admin() (raises 42501 for non-admins). It is
-- SECURITY DEFINER so it can write the catalog tables despite admin-write RLS;
-- the is_admin() check inside is the real authority. EXECUTE is granted to
-- `authenticated` because the gate lives in the function body, not in the grant.
--
-- Apply via Supabase migration tooling. Assumes 0001_sp1_foundation.sql is live.
-- ============================================================================

-- Payload shape (jsonb):
--   {
--     "stand_id": "<uuid>"|null,   -- null/absent => create, present => update
--     "event_id": "<uuid>",        -- required on create, ignored on update
--     "stand":    { ...columns },  -- create: full row; update: only keys to patch
--     "activity": { ...columns }|absent,  -- upserted (one per stand) when present
--     "badge":    { ...columns }|absent   -- upserted (one per activity) when present
--   }
-- On update, a present-but-null key is an explicit "set to null"; an absent key
-- is left unchanged. The stand slug and event_id are immutable on update.
create or replace function public.admin_upsert_stand(payload jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_stand_id    uuid := nullif(payload->>'stand_id', '')::uuid;
  v_event_id    uuid := nullif(payload->>'event_id', '')::uuid;
  v_stand       jsonb := coalesce(payload->'stand', '{}'::jsonb);
  v_activity    jsonb := payload->'activity';
  v_badge       jsonb := payload->'badge';
  v_activity_id uuid;
  v_badge_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_stand_id is null then
    -- ---- CREATE -----------------------------------------------------------
    if v_event_id is null then
      raise exception 'event_id is required to create a stand' using errcode = '23502';
    end if;
    if not exists (select 1 from public.events e where e.id = v_event_id) then
      raise exception 'event does not exist' using errcode = '23503';
    end if;

    insert into public.stands (
      event_id, slug, name, description, tag,
      map_x, map_y, icon, color, accent, piece_id, sort
    ) values (
      v_event_id,
      v_stand->>'slug',
      v_stand->>'name',
      v_stand->>'description',
      v_stand->>'tag',
      (v_stand->>'map_x')::numeric,
      (v_stand->>'map_y')::numeric,
      v_stand->>'icon',
      v_stand->>'color',
      v_stand->>'accent',
      v_stand->>'piece_id',
      coalesce((v_stand->>'sort')::int, 0)
    )
    returning id into v_stand_id;
  else
    -- ---- UPDATE (partial patch; slug & event_id are immutable) -------------
    update public.stands s set
      name        = case when v_stand ? 'name'        then v_stand->>'name'             else s.name end,
      description = case when v_stand ? 'description' then v_stand->>'description'      else s.description end,
      tag         = case when v_stand ? 'tag'         then v_stand->>'tag'             else s.tag end,
      map_x       = case when v_stand ? 'map_x'       then (v_stand->>'map_x')::numeric else s.map_x end,
      map_y       = case when v_stand ? 'map_y'       then (v_stand->>'map_y')::numeric else s.map_y end,
      icon        = case when v_stand ? 'icon'        then v_stand->>'icon'            else s.icon end,
      color       = case when v_stand ? 'color'       then v_stand->>'color'           else s.color end,
      accent      = case when v_stand ? 'accent'      then v_stand->>'accent'          else s.accent end,
      piece_id    = case when v_stand ? 'piece_id'    then v_stand->>'piece_id'        else s.piece_id end,
      sort        = case when v_stand ? 'sort'        then (v_stand->>'sort')::int      else s.sort end
    where s.id = v_stand_id;
    if not found then
      raise exception 'stand does not exist' using errcode = 'P0002';
    end if;
  end if;

  -- ---- ACTIVITY (one per stand, RN-03): upsert when provided ---------------
  if v_activity is not null then
    select id into v_activity_id from public.activities where stand_id = v_stand_id;
    if v_activity_id is null then
      insert into public.activities (
        stand_id, slug, name, description, score_type,
        points_fixed, points_first, points_second, points_third, special, sort
      ) values (
        v_stand_id,
        v_activity->>'slug',
        v_activity->>'name',
        v_activity->>'description',
        coalesce(v_activity->>'score_type', 'fixed'),
        coalesce((v_activity->>'points_fixed')::int, 1),
        (v_activity->>'points_first')::int,
        (v_activity->>'points_second')::int,
        (v_activity->>'points_third')::int,
        coalesce((v_activity->>'special')::boolean, false),
        coalesce((v_activity->>'sort')::int, 0)
      )
      returning id into v_activity_id;
    else
      update public.activities a set
        slug          = coalesce(v_activity->>'slug', a.slug),
        name          = coalesce(v_activity->>'name', a.name),
        description   = v_activity->>'description',
        score_type    = coalesce(v_activity->>'score_type', a.score_type),
        points_fixed  = coalesce((v_activity->>'points_fixed')::int, a.points_fixed),
        points_first  = (v_activity->>'points_first')::int,
        points_second = (v_activity->>'points_second')::int,
        points_third  = (v_activity->>'points_third')::int,
        special       = coalesce((v_activity->>'special')::boolean, a.special),
        sort          = coalesce((v_activity->>'sort')::int, a.sort)
      where a.id = v_activity_id;
    end if;
  end if;

  -- ---- BADGE (one per activity, RN-04): upsert when provided ---------------
  if v_badge is not null then
    if v_activity_id is null then
      select id into v_activity_id from public.activities where stand_id = v_stand_id;
    end if;
    if v_activity_id is not null then
      select id into v_badge_id from public.badges where activity_id = v_activity_id;
      if v_badge_id is null then
        insert into public.badges (activity_id, name, description, icon)
        values (
          v_activity_id,
          v_badge->>'name',
          v_badge->>'description',
          v_badge->>'icon'
        );
      else
        update public.badges b set
          name        = coalesce(v_badge->>'name', b.name),
          description = v_badge->>'description',
          icon        = v_badge->>'icon'
        where b.id = v_badge_id;
      end if;
    end if;
  end if;

  return v_stand_id;
end;
$$;

grant execute on function public.admin_upsert_stand(jsonb) to authenticated;
