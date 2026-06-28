/**
 * SP2 — admin Staff account creation + assignment integration test.
 *
 * Exercises the server-only core (`supabase-admin-staff-server.ts`) directly,
 * against the real remote Supabase project, using the service-role client the
 * same way the `/api/admin/staff` Route Handler does. Testing the core function
 * avoids having to boot a Next.js server while still covering the real DB
 * behaviour (auth account creation, role promotion, assignment, RLS-locked
 * columns).
 *
 * Security contract under test:
 *  - An ADMIN caller creates a staff user → the auth account exists, its profile
 *    role is 'staff', and the staff_assignments row exists.
 *  - A NON-admin caller is rejected (StaffAuthorizationError) and NOTHING is
 *    created — no auth user, no profile, no assignment.
 *  - A duplicate email surfaces a clear validation error.
 *  - A stand that does not belong to the chosen event is rejected.
 *  - Input validation (email, password) fails at the boundary.
 *  - unassignStaff removes the assignment row (admin-only).
 *  - listStaffForEvent returns the assignment enriched with username/email.
 *
 * Conventions mirror test/sp2/admin-stands.test.ts. All created users / events
 * are cleaned up in afterEach.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/supabase';
import { createEvent } from '../../src/infrastructure/supabase-admin-repository';
import { createStand } from '../../src/infrastructure/supabase-admin-stands-repository';
import {
  createStaffAccount,
  unassignStaff,
  listStaffForEvent,
  StaffValidationError,
  StaffAuthorizationError,
} from '../../src/infrastructure/supabase-admin-staff-server';

const STAFF_PASSWORD = 'staff-password-1234!';

async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

function standInput(slug: string) {
  return {
    name: 'Cloud Outpost',
    slug,
    mapX: 16,
    mapY: 70,
    sort: 0,
    activity: { name: 'Ring toss', scoreType: 'fixed' as const, pointsFixed: 1, special: false },
    badge: { name: 'Cloud Champion' },
  };
}

describe('SP2 — admin Staff account creation + assignment', () => {
  const service: SupabaseClient = serviceClient();
  let createdUserIds: string[] = [];
  let seededEmails: string[] = [];
  let createdEventIds: string[] = [];

  afterEach(async () => {
    // Deleting the event cascades to its stands and staff_assignments.
    for (const id of createdEventIds) {
      await service.from('events').delete().eq('id', id);
    }
    // Deleting the auth user cascades to its profile and staff_assignments.
    for (const id of createdUserIds) {
      try {
        await deleteTestUser(id, service);
      } catch {
        /* best-effort teardown */
      }
    }
    for (const email of seededEmails) {
      await service.from('admin_allowlist').delete().eq('email', email);
    }
    createdUserIds = [];
    seededEmails = [];
    createdEventIds = [];
  });

  /** Create an allowlisted admin user and return its id + an authed client. */
  async function makeAdmin(): Promise<{ id: string; client: SupabaseClient }> {
    const email = uniqueEmail('admin');
    const { error: allowError } = await service.from('admin_allowlist').insert({ email });
    if (allowError) throw new Error(`Failed to seed admin_allowlist: ${allowError.message}`);
    seededEmails.push(email);
    const admin = await createTestUser(service, email);
    createdUserIds.push(admin.id);
    const client = await authedClient(admin.email, admin.password);
    return { id: admin.id, client };
  }

  /** Create an event + one stand under it, returning their ids. */
  async function makeEventWithStand(
    adminClient: SupabaseClient,
  ): Promise<{ eventId: string; standId: string }> {
    const event = await createEvent(adminClient, {
      name: 'Staff Host Event',
      slug: uniqueSlug('sp2-staff-evt'),
    });
    createdEventIds.push(event.id);
    const stand = await createStand(adminClient, event.id, standInput(uniqueSlug('cloud')));
    return { eventId: event.id, standId: stand.id };
  }

  it('lets an admin create a staff account, promote to staff, and assign it', async () => {
    const admin = await makeAdmin();
    const { eventId, standId } = await makeEventWithStand(admin.client);

    const email = uniqueEmail('staff');
    const summary = await createStaffAccount(admin.id, {
      username: 'StaffOne',
      email,
      password: STAFF_PASSWORD,
      eventId,
      standId,
    });
    createdUserIds.push(summary.id);

    expect(summary.role).toBe('staff');
    expect(summary.email).toBe(email);
    expect(summary.assignmentId).toBeTruthy();

    // Profile was promoted to staff (verified via the service role).
    const { data: profile } = await service
      .from('profiles')
      .select('role, email')
      .eq('id', summary.id)
      .maybeSingle();
    expect(profile?.role).toBe('staff');
    expect(profile?.email).toBe(email);

    // The assignment row exists and is correctly linked.
    const { data: assignment } = await service
      .from('staff_assignments')
      .select('id, staff_id, event_id, stand_id')
      .eq('id', summary.assignmentId)
      .maybeSingle();
    expect(assignment).not.toBeNull();
    expect(assignment?.staff_id).toBe(summary.id);
    expect(assignment?.event_id).toBe(eventId);
    expect(assignment?.stand_id).toBe(standId);
  });

  it('rejects a NON-admin caller and creates nothing', async () => {
    const admin = await makeAdmin();
    const { eventId, standId } = await makeEventWithStand(admin.client);

    // A plain participant (not allowlisted) tries to create staff.
    const player = await createTestUser(service);
    createdUserIds.push(player.id);

    const email = uniqueEmail('should-not-exist');
    await expect(
      createStaffAccount(player.id, {
        username: 'Nope',
        email,
        password: STAFF_PASSWORD,
        eventId,
        standId,
      }),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);

    // No account was created for that email…
    const { data: leakedProfiles } = await service
      .from('profiles')
      .select('id')
      .eq('email', email);
    expect(leakedProfiles ?? []).toHaveLength(0);

    // …and no assignment leaked onto the stand.
    const { data: leakedAssignments } = await service
      .from('staff_assignments')
      .select('id')
      .eq('stand_id', standId);
    expect(leakedAssignments ?? []).toHaveLength(0);
  });

  it('surfaces a clear error when the email already exists', async () => {
    const admin = await makeAdmin();
    const { eventId, standId } = await makeEventWithStand(admin.client);

    const email = uniqueEmail('dupe');
    const first = await createStaffAccount(admin.id, {
      username: 'FirstStaff',
      email,
      password: STAFF_PASSWORD,
      eventId,
      standId,
    });
    createdUserIds.push(first.id);

    await expect(
      createStaffAccount(admin.id, {
        username: 'SecondStaff',
        email,
        password: STAFF_PASSWORD,
        eventId,
        standId,
      }),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });

  it('rejects a stand that does not belong to the chosen event', async () => {
    const admin = await makeAdmin();
    const a = await makeEventWithStand(admin.client);
    const b = await makeEventWithStand(admin.client);

    await expect(
      createStaffAccount(admin.id, {
        username: 'WrongStand',
        email: uniqueEmail('wrong'),
        password: STAFF_PASSWORD,
        eventId: a.eventId,
        standId: b.standId, // belongs to event B, not A
      }),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });

  it('validates email and password at the boundary', async () => {
    const admin = await makeAdmin();
    const { eventId, standId } = await makeEventWithStand(admin.client);

    await expect(
      createStaffAccount(admin.id, {
        username: 'BadEmail',
        email: 'not-an-email',
        password: STAFF_PASSWORD,
        eventId,
        standId,
      }),
    ).rejects.toBeInstanceOf(StaffValidationError);

    await expect(
      createStaffAccount(admin.id, {
        username: 'ShortPass',
        email: uniqueEmail('shortpass'),
        password: 'short',
        eventId,
        standId,
      }),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });

  it('unassigns a staff member (admin-only) and rejects non-admin unassign', async () => {
    const admin = await makeAdmin();
    const { eventId, standId } = await makeEventWithStand(admin.client);

    const summary = await createStaffAccount(admin.id, {
      username: 'ToRemove',
      email: uniqueEmail('remove'),
      password: STAFF_PASSWORD,
      eventId,
      standId,
    });
    createdUserIds.push(summary.id);

    // A non-admin cannot unassign.
    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    await expect(unassignStaff(player.id, summary.assignmentId)).rejects.toBeInstanceOf(
      StaffAuthorizationError,
    );
    // The assignment is still there.
    const { data: still } = await service
      .from('staff_assignments')
      .select('id')
      .eq('id', summary.assignmentId);
    expect(still ?? []).toHaveLength(1);

    // The admin can.
    await unassignStaff(admin.id, summary.assignmentId);
    const { data: gone } = await service
      .from('staff_assignments')
      .select('id')
      .eq('id', summary.assignmentId);
    expect(gone ?? []).toHaveLength(0);
  });

  it('lists staff for an event enriched with username/email', async () => {
    const admin = await makeAdmin();
    const { eventId, standId } = await makeEventWithStand(admin.client);

    const email = uniqueEmail('listed');
    const summary = await createStaffAccount(admin.id, {
      username: 'ListedStaff',
      email,
      password: STAFF_PASSWORD,
      eventId,
      standId,
    });
    createdUserIds.push(summary.id);

    const list = await listStaffForEvent(admin.id, eventId);
    const row = list.find((s) => s.id === summary.assignmentId);
    expect(row).toBeTruthy();
    expect(row?.staffId).toBe(summary.id);
    expect(row?.standId).toBe(standId);
    expect(row?.username).toBe('ListedStaff');
    expect(row?.email).toBe(email);

    // A non-admin cannot list.
    const player = await createTestUser(service);
    createdUserIds.push(player.id);
    await expect(listStaffForEvent(player.id, eventId)).rejects.toBeInstanceOf(
      StaffAuthorizationError,
    );
  });
});
