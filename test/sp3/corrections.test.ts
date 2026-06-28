/**
 * SP3 — correct_points RPC + point_corrections audit ledger integration test.
 *
 * Exercises the server-side point-correction backbone (RN-09, CA-07) against the
 * real remote Supabase project. Points (participations.tickets) are awarded by
 * approve_completion; a correction sets a new ABSOLUTE total and MUST append an
 * immutable audit row. Corrections are server-side only (SECURITY DEFINER) and
 * authorized as admin OR staff-of-that-event — never a client write grant.
 *
 * Security / behaviour contract under test:
 *  - An ADMIN corrects points → tickets become the new total, a point_corrections
 *    row exists with the right before/after/delta/reason/corrected_by, and the
 *    RPC returns { ok, before, after, delta }.
 *  - A STAFF user assigned to that event can correct too (RN-09: staff allowed).
 *  - A user who is NOT staff of that event is rejected (42501) — tickets unchanged
 *    and NO audit row is written.
 *  - A blank reason is rejected; a negative new total is rejected.
 *  - History is readable (admin sees the rows) and APPEND-ONLY: a second
 *    correction adds a new row and keeps the first — the original is never deleted.
 *
 * Conventions mirror test/sp3/approve-completion.test.ts and
 * test/sp2/admin-staff.test.ts: the service-role client is used only for setup /
 * teardown and cross-user assertions; the authenticated browser path is
 * reproduced by signing throwaway users into anon clients. Run this file in
 * isolation — the full suite trips auth rate limits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type SupabaseClient,
} from '../helpers/supabase';

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function authedFor(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe('SP3 correct_points — point corrections with audit history (RN-09, CA-07)', () => {
  const service: SupabaseClient = serviceClient();

  let eventId: string;
  let standId: string;
  let otherEventId: string;
  let adminId: string;
  let adminClient: SupabaseClient;
  let adminEmail: string;
  let staffId: string;
  let staffClient: SupabaseClient;
  let outsiderId: string; // a staff of a DIFFERENT event — not authorized here
  let outsiderClient: SupabaseClient;
  let playerId: string;

  /**
   * Seed (or reset) the shared player's participation in the shared event with a
   * known starting ticket balance, and return the participation id.
   *
   * The participation is upserted on (player_id, event_id), so every test reuses
   * the SAME row. To keep each test's correction count independent, this also
   * wipes the participation's audit ledger — otherwise point_corrections rows
   * from earlier cases would leak into a later "expected 0/1" assertion.
   */
  async function seedParticipation(tickets: number): Promise<string> {
    const { data, error } = await service
      .from('participations')
      .upsert(
        { player_id: playerId, event_id: eventId, tickets },
        { onConflict: 'player_id,event_id' },
      )
      .select('id')
      .single();
    if (error || !data) throw new Error(`participation seed failed: ${error?.message}`);
    const participationId = data.id as string;
    // Reset the append-only audit ledger so correction counts start at zero per test.
    const { error: wipeErr } = await service
      .from('point_corrections')
      .delete()
      .eq('participation_id', participationId);
    if (wipeErr) throw new Error(`audit ledger reset failed: ${wipeErr.message}`);
    return participationId;
  }

  async function ticketsOfParticipation(participationId: string): Promise<number> {
    const { data } = await service
      .from('participations')
      .select('tickets')
      .eq('id', participationId)
      .single();
    return data?.tickets ?? 0;
  }

  async function auditRows(participationId: string) {
    const { data } = await service
      .from('point_corrections')
      .select('id, points_before, points_after, delta, reason, corrected_by, created_at')
      .eq('participation_id', participationId)
      .order('created_at', { ascending: true });
    return data ?? [];
  }

  beforeAll(async () => {
    // Shared event + stand.
    const { data: ev, error: evErr } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-corr-evt'), name: 'SP3 Corrections Event', status: 'active' })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event insert failed: ${evErr?.message}`);
    eventId = ev.id as string;

    const { data: stand, error: standErr } = await service
      .from('stands')
      .insert({ event_id: eventId, slug: uniqueSlug('stand'), name: 'Cloud Outpost', map_x: 10, map_y: 20 })
      .select('id')
      .single();
    if (standErr || !stand) throw new Error(`stand insert failed: ${standErr?.message}`);
    standId = stand.id as string;

    // A second event the outsider staffs (so they are staff, but of the WRONG event).
    const { data: ev2, error: ev2Err } = await service
      .from('events')
      .insert({ slug: uniqueSlug('sp3-other-evt'), name: 'SP3 Other Event', status: 'active' })
      .select('id')
      .single();
    if (ev2Err || !ev2) throw new Error(`other event insert failed: ${ev2Err?.message}`);
    otherEventId = ev2.id as string;
    const { data: stand2, error: stand2Err } = await service
      .from('stands')
      .insert({ event_id: otherEventId, slug: uniqueSlug('stand2'), name: 'Other Outpost', map_x: 5, map_y: 5 })
      .select('id')
      .single();
    if (stand2Err || !stand2) throw new Error(`other stand insert failed: ${stand2Err?.message}`);

    // Admin (allowlisted email -> handle_new_user assigns role 'admin').
    adminEmail = uniqueEmail('admin');
    const { error: allowErr } = await service.from('admin_allowlist').insert({ email: adminEmail });
    if (allowErr) throw new Error(`admin_allowlist seed failed: ${allowErr.message}`);
    const admin = await createTestUser(service, adminEmail);
    adminId = admin.id;
    adminClient = await authedFor(admin.email, admin.password);

    // Staff of the shared event (authorized via staff_assignments).
    const staff = await createTestUser(service);
    staffId = staff.id;
    staffClient = await authedFor(staff.email, staff.password);
    const { error: asgErr } = await service
      .from('staff_assignments')
      .insert({ staff_id: staffId, event_id: eventId, stand_id: standId });
    if (asgErr) throw new Error(`staff_assignment insert failed: ${asgErr.message}`);

    // Outsider: staff of the OTHER event only — must NOT be able to correct here.
    const outsider = await createTestUser(service);
    outsiderId = outsider.id;
    outsiderClient = await authedFor(outsider.email, outsider.password);
    const { error: asg2Err } = await service
      .from('staff_assignments')
      .insert({ staff_id: outsiderId, event_id: otherEventId, stand_id: stand2.id });
    if (asg2Err) throw new Error(`outsider staff_assignment insert failed: ${asg2Err.message}`);

    // The player whose tickets get corrected.
    const player = await createTestUser(service);
    playerId = player.id;
  });

  afterAll(async () => {
    for (const id of [playerId, staffId, outsiderId, adminId]) {
      if (id) {
        try {
          await deleteTestUser(id, service);
        } catch {
          /* best-effort teardown */
        }
      }
    }
    if (eventId) await service.from('events').delete().eq('id', eventId);
    if (otherEventId) await service.from('events').delete().eq('id', otherEventId);
    if (adminEmail) await service.from('admin_allowlist').delete().eq('email', adminEmail);
  });

  it('lets an admin correct points and writes an audit row', async () => {
    const participationId = await seedParticipation(10);

    const { data, error } = await adminClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 25,
      p_reason: 'Marcador mal cargado en el stand',
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, before: 10, after: 25, delta: 15 });

    expect(await ticketsOfParticipation(participationId)).toBe(25);

    const rows = await auditRows(participationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].points_before).toBe(10);
    expect(rows[0].points_after).toBe(25);
    expect(rows[0].delta).toBe(15);
    expect(rows[0].reason).toBe('Marcador mal cargado en el stand');
    expect(rows[0].corrected_by).toBe(adminId);
  });

  it('lets a staff member of that event correct points (RN-09)', async () => {
    const participationId = await seedParticipation(8);

    const { data, error } = await staffClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 3,
      p_reason: 'Descuento por reclamo duplicado',
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, before: 8, after: 3, delta: -5 });

    expect(await ticketsOfParticipation(participationId)).toBe(3);
    const rows = await auditRows(participationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].corrected_by).toBe(staffId);
  });

  it('rejects a user who is not staff of that event (42501) and changes nothing', async () => {
    const participationId = await seedParticipation(12);

    const { error } = await outsiderClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 0,
      p_reason: 'Intento no autorizado',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');

    // Tickets untouched and no audit row written.
    expect(await ticketsOfParticipation(participationId)).toBe(12);
    expect(await auditRows(participationId)).toHaveLength(0);
  });

  it('rejects a blank reason', async () => {
    const participationId = await seedParticipation(7);

    const { error } = await adminClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 9,
      p_reason: '   ',
    });
    expect(error).not.toBeNull();

    expect(await ticketsOfParticipation(participationId)).toBe(7);
    expect(await auditRows(participationId)).toHaveLength(0);
  });

  it('rejects a negative new ticket total', async () => {
    const participationId = await seedParticipation(7);

    const { error } = await adminClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: -1,
      p_reason: 'Total inválido',
    });
    expect(error).not.toBeNull();

    expect(await ticketsOfParticipation(participationId)).toBe(7);
    expect(await auditRows(participationId)).toHaveLength(0);
  });

  it('keeps history append-only: a second correction adds a row and keeps the first', async () => {
    const participationId = await seedParticipation(10);

    const first = await adminClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 15,
      p_reason: 'Primera corrección',
    });
    expect(first.error).toBeNull();
    const firstRows = await auditRows(participationId);
    expect(firstRows).toHaveLength(1);
    const firstId = firstRows[0].id as string;

    const second = await adminClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 5,
      p_reason: 'Segunda corrección',
    });
    expect(second.error).toBeNull();

    const rows = await auditRows(participationId);
    expect(rows).toHaveLength(2);
    // The original row is preserved verbatim — never deleted or mutated.
    const preserved = rows.find((r) => r.id === firstId);
    expect(preserved).toBeDefined();
    expect(preserved!.points_before).toBe(10);
    expect(preserved!.points_after).toBe(15);
    // The latest balance reflects the most recent correction.
    expect(await ticketsOfParticipation(participationId)).toBe(5);
  });

  it('exposes the history through list_point_corrections for an admin with the corrector name', async () => {
    const participationId = await seedParticipation(10);

    await adminClient.rpc('correct_points', {
      p_participation_id: participationId,
      p_new_tickets: 20,
      p_reason: 'Ajuste auditado',
    });

    const { data, error } = await adminClient.rpc('list_point_corrections', {
      p_participation_id: participationId,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    const entry = data.find((r: { reason: string }) => r.reason === 'Ajuste auditado');
    expect(entry).toBeDefined();
    expect(entry.points_before).toBe(10);
    expect(entry.points_after).toBe(20);
    expect(entry.delta).toBe(10);
    expect(entry.corrected_by).toBe(adminId);
    expect(typeof entry.corrector_name).toBe('string');
  });
});
