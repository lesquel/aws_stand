-- ============================================================================
-- Cloud Quest · SP3 — server-authoritative prize claiming (integrity hardening)
--
-- Moves prize claiming off the client. Before this, claiming was a pure
-- client function (claimPrize) that deducted tickets + appended to `claimed`
-- locally, a cosmetic decrementStock() that mutated an in-memory catalog array
-- (never the DB — a stock no-op), and a debounced write-behind that persisted
-- the new tickets/claimed via the broad participations UPDATE grant. That let a
-- player self-award by writing participations directly (set tickets, fabricate
-- claimed) and never actually consumed prize stock.
--
-- claim_prize is the single SECURITY DEFINER entry point. Authorization is the
-- caller themselves (auth.uid()); it writes participations + prizes despite the
-- (still-present) client write grants because the effect must be atomic and the
-- stock check must be race-safe.
--
-- Apply via Supabase migration tooling. Assumes 0001_sp1_foundation.sql is live.
--
-- ----------------------------------------------------------------------------
-- DEFERRED — revoke of the client participation UPDATE grant.
--
-- The original SP3 plan also revoked
--   `update (tickets, pieces, badges, claimed, done_activities)`
-- on public.participations from authenticated, closing the SP1 self-mutation
-- hole (a player writing `tickets = 9999`). That revoke is NOT included here
-- because it is BLOCKED: the live StandScreen "Validar" flow
-- (actions.approve -> approveActivity -> write-behind saveParticipation) still
-- awards tickets/pieces/badges/done_activities entirely client-side and depends
-- on that grant. Revoking now would break stand-activity awarding. Closing the
-- hole requires first moving stand approval server-side (the documented
-- `approve_activity` RPC follow-up). Once that lands, a follow-up migration
-- should run:
--
--   revoke update on public.participations from authenticated;
--   drop policy if exists participations_update_own on public.participations;
--
-- (SELECT stays granted; participations would then be mutated only by the
-- SECURITY DEFINER RPCs join_event, approve_completion, correct_points,
-- claim_prize.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- claim_prize — atomically claim a prize for the calling player.
--
-- Order of checks / effects:
--   1. require an authenticated caller (42501).
--   2. resolve the caller's participation in the event -> id, tickets, claimed;
--      none -> P0002.
--   3. resolve the prize by (event_id, slug) and lock it FOR UPDATE so
--      concurrent claims serialize on stock; unknown prize -> P0002.
--   4. reject (P0001) when: already in `claimed`, stock <= 0, or tickets < cost.
--   5. deduct tickets, append the slug to `claimed`, decrement prize stock.
--   6. return { ok, tickets_left, stock_left }.
-- ----------------------------------------------------------------------------
create or replace function public.claim_prize(
  p_event_id uuid,
  p_prize_slug text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_player        uuid := auth.uid();
  v_participation uuid;
  v_tickets       int;
  v_claimed       jsonb;
  v_prize_id      uuid;
  v_cost          int;
  v_stock         int;
begin
  -- 1. authenticated caller required
  if v_player is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 2. resolve the caller's own participation in this event
  select pa.id, pa.tickets, pa.claimed
    into v_participation, v_tickets, v_claimed
  from public.participations pa
  where pa.player_id = v_player and pa.event_id = p_event_id;

  if v_participation is null then
    raise exception 'no participation in this event' using errcode = 'P0002';
  end if;

  -- 3. resolve + lock the prize row (serializes concurrent stock decrements)
  select pr.id, pr.cost, pr.stock
    into v_prize_id, v_cost, v_stock
  from public.prizes pr
  where pr.event_id = p_event_id and pr.slug = p_prize_slug
  for update;

  if v_prize_id is null then
    raise exception 'unknown prize' using errcode = 'P0002';
  end if;

  -- 4. business-rule rejections (no state change)
  if v_claimed ? p_prize_slug then
    raise exception 'prize already claimed' using errcode = 'P0001';
  end if;

  if v_stock <= 0 then
    raise exception 'prize out of stock' using errcode = 'P0001';
  end if;

  if v_tickets < v_cost then
    raise exception 'insufficient tickets' using errcode = 'P0001';
  end if;

  -- 5. atomic effect: deduct tickets, record the claim, consume stock
  update public.participations
    set tickets = tickets - v_cost,
        claimed = claimed || to_jsonb(p_prize_slug)
  where id = v_participation;

  update public.prizes
    set stock = stock - 1
  where id = v_prize_id;

  -- 6. report the outcome
  return jsonb_build_object(
    'ok', true,
    'tickets_left', v_tickets - v_cost,
    'stock_left', v_stock - 1
  );
end;
$$;

grant execute on function public.claim_prize(uuid, text) to authenticated;
