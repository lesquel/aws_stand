/* ============================================================
   Route Handler · /api/admin/staff  ——  SERVER ONLY (Node runtime)

   Admin-only endpoint to create staff accounts and manage their stand
   assignments. This is the ONLY place account creation happens, because it
   needs the service-role key, which must never reach the browser.

   Authorization is two-layered:
     1. The bearer token (the caller's Supabase access token) is validated here
        to prove identity (`getUserIdFromToken`).
     2. The underlying server functions re-check that the caller's profile role
        is `admin` against the database before doing anything privileged. A
        non-admin token is rejected with 403 and nothing is created/changed.

     POST    create a staff account + assign to event/stand
     DELETE  remove a staff assignment (?assignmentId=…)
     GET     list staff assigned to an event (?eventId=…)
   ============================================================ */

import { NextResponse } from 'next/server';
import { getUserIdFromToken } from '@/infrastructure/supabase-admin-server';
import {
  createStaffAccount,
  unassignStaff,
  listStaffForEvent,
  StaffValidationError,
  StaffAuthorizationError,
} from '@/infrastructure/supabase-admin-staff-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof StaffAuthorizationError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof StaffValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  // Unexpected error: log the real cause server-side, but never leak it to the
  // client. Raw `err.message` can expose PostgREST/Postgres schema details, so
  // the response stays a generic message.
  console.error('[staff-route]', err);
  return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
}

/** Resolve the caller's user id from the bearer token, or null when unauthenticated. */
async function resolveCaller(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  return getUserIdFromToken(token);
}

export async function POST(req: Request): Promise<NextResponse> {
  const callerId = await resolveCaller(req);
  if (!callerId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  try {
    const summary = await createStaffAccount(callerId, {
      username: String(body.username ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      eventId: String(body.eventId ?? ''),
      standId: String(body.standId ?? ''),
      baseId: body.baseId != null ? String(body.baseId) : undefined,
    });
    return NextResponse.json({ staff: summary }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const callerId = await resolveCaller(req);
  if (!callerId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  let assignmentId = new URL(req.url).searchParams.get('assignmentId') ?? '';
  if (!assignmentId) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      assignmentId = String(body.assignmentId ?? '');
    } catch {
      /* no body — fall through to validation error below */
    }
  }

  try {
    await unassignStaff(callerId, assignmentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const callerId = await resolveCaller(req);
  if (!callerId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const eventId = new URL(req.url).searchParams.get('eventId') ?? '';
  try {
    const staff = await listStaffForEvent(callerId, eventId);
    return NextResponse.json({ staff });
  } catch (err) {
    return errorResponse(err);
  }
}
