-- ============================================================================
-- Cloud Quest · SP1 seed — default "AWS Cloud Quest" event
--
-- Bootstraps one active event so the app is not empty on a fresh database.
-- Source of truth for the values: src/domain/catalog.ts (legacy STANDS / PRIZES).
--
-- Modeling note (RN-03: exactly one activity per stand): the legacy catalog has
-- three activities per stand, but the new model allows only one. This seed
-- therefore creates ONE representative activity per stand — the stand's FIRST
-- legacy activity — as a 'fixed' score activity whose points equal that
-- activity's legacy ticket value. Each activity gets ONE badge (RN-04), named
-- after the stand's collectible piece. UI copy is seeded in neutral Spanish to
-- match the app's tone.
--
-- Idempotent: deletes any prior copy of this event by slug first; ON DELETE
-- CASCADE clears the event's stands/activities/badges/prizes, then re-inserts.
-- Runs as service-role (applied via the Supabase MCP), so it bypasses RLS.
-- Apply AFTER supabase/migrations/0001_sp1_foundation.sql.
-- ============================================================================

do $$
declare
  v_event uuid;
  v_stand uuid;
  v_act   uuid;
begin
  -- Idempotency: drop any previous seed of this event (cascades to children).
  delete from public.events where slug = 'aws-cloud-quest';

  insert into public.events (slug, name, description, status)
  values (
    'aws-cloud-quest',
    'AWS Cloud Quest',
    'Recorre los puestos, completa las actividades y arma tu avatar.',
    'active'
  )
  returning id into v_event;

  -- ----- Stand: cloud (piece: cap) -----------------------------------------
  insert into public.stands
    (event_id, slug, name, description, tag, map_x, map_y, icon, color, accent, piece_id, sort)
  values
    (v_event, 'cloud', 'Puesto Nube',
     'Lanza tu carga a la nube y aprende a escalar sin servidores.',
     'AWS · Infraestructura', 16, 70, 'ic_cloud', 'var(--orange)', '#ff9900', 'cap', 0)
  returning id into v_stand;

  insert into public.activities
    (stand_id, slug, name, score_type, points_fixed, special, sort)
  values
    (v_stand, 'c1', 'Lanza el aro a la nube', 'fixed', 1, false, 0)
  returning id into v_act;

  insert into public.badges (activity_id, name, icon)
  values (v_act, 'Gorra AWS', 'cap');

  -- ----- Stand: ia (piece: visor) ------------------------------------------
  insert into public.stands
    (event_id, slug, name, description, tag, map_x, map_y, icon, color, accent, piece_id, sort)
  values
    (v_event, 'ia', 'Laboratorio IA',
     'Entrena un modelo en vivo y reta a la máquina a adivinar tu dibujo.',
     'Inteligencia Artificial', 38, 34, 'ic_chip', 'var(--cyan)', '#36c5f0', 'visor', 1)
  returning id into v_stand;

  insert into public.activities
    (stand_id, slug, name, score_type, points_fixed, special, sort)
  values
    (v_stand, 'i1', 'Adivina con la IA', 'fixed', 1, false, 0)
  returning id into v_act;

  insert into public.badges (activity_id, name, icon)
  values (v_act, 'Visor IA', 'visor');

  -- ----- Stand: sec (piece: shield) ----------------------------------------
  insert into public.stands
    (event_id, slug, name, description, tag, map_x, map_y, icon, color, accent, piece_id, sort)
  values
    (v_event, 'sec', 'Bastión Security',
     'Defiende el castillo: detecta la brecha antes de que caiga el muro.',
     'Seguridad en la nube', 62, 64, 'ic_shield', 'var(--green)', '#2bd576', 'shield', 2)
  returning id into v_stand;

  insert into public.activities
    (stand_id, slug, name, score_type, points_fixed, special, sort)
  values
    (v_stand, 's1', 'Encuentra la brecha', 'fixed', 1, false, 0)
  returning id into v_act;

  insert into public.badges (activity_id, name, icon)
  values (v_act, 'Escudo Cloud', 'shield');

  -- ----- Stand: crew (piece: backpack) -------------------------------------
  insert into public.stands
    (event_id, slug, name, description, tag, map_x, map_y, icon, color, accent, piece_id, sort)
  values
    (v_event, 'crew', 'Aldea Community',
     'Conoce builders, intercambia stickers y suma aliados a tu party.',
     'Comunidad & Networking', 80, 30, 'ic_people', 'var(--pink)', '#ff5c8a', 'backpack', 3)
  returning id into v_stand;

  insert into public.activities
    (stand_id, slug, name, score_type, points_fixed, special, sort)
  values
    (v_stand, 'm1', 'Conoce a 3 builders', 'fixed', 1, false, 0)
  returning id into v_act;

  insert into public.badges (activity_id, name, icon)
  values (v_act, 'Mochila Crew', 'backpack');

  -- ----- Stand: build (piece: boots) ---------------------------------------
  insert into public.stands
    (event_id, slug, name, description, tag, map_x, map_y, icon, color, accent, piece_id, sort)
  values
    (v_event, 'build', 'Arena Builders',
     'La zona jefe. Completa el circuito de builders y reclama tus botas.',
     'Reto final', 50, 88, 'ic_gear', 'var(--purple)', '#9b6dff', 'boots', 4)
  returning id into v_stand;

  insert into public.activities
    (stand_id, slug, name, score_type, points_fixed, special, sort)
  values
    (v_stand, 'b1', 'Mini-hack de 5 min', 'fixed', 2, false, 0)
  returning id into v_act;

  insert into public.badges (activity_id, name, icon)
  values (v_act, 'Botas Builder', 'boots');

  -- ----- Prizes (event-scoped) ---------------------------------------------
  insert into public.prizes (event_id, slug, name, cost, stock, raffle) values
    (v_event, 'stickers', 'Pack de stickers',         3,  200, false),
    (v_event, 'tee',      'Camiseta del evento',       8,  80,  false),
    (v_event, 'bag',      'Mochila builder',          14,  40,  false),
    (v_event, 'cap',      'Gorra edición límite',     10,  60,  false),
    (v_event, 'grand',    'Sorteo: ticket a re:Invent', 1,  1,   true);
end $$;
