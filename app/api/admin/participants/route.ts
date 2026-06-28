/* ============================================================
   Route Handler · /api/admin/participants  ——  SERVER ONLY (Node runtime)

   Admin-only endpoint to manage PARTICIPANT accounts (CA-09): list them, edit a
   participant's username, and delete a participant account. Creating
   participants is normal self-signup, so there is no POST here.

   These operations need the service-role key (read other users' profiles past
   RLS, edit someone else's username, delete an auth user), which must never
   reach the browser — hence this server-only Route Handler.

   Authorization is two-layered:
     1. The bearer token (the caller's Supabase access token) is validated here
        to prove identity (`getUserIdFromToken`).
     2. The underlying server functions re-check that the caller's profile role
        is `admin` against the database before doing anything privileged. A
        non-admin token is rejected with 403 and nothing is read/changed.

     GET     list all participant accounts
     PATCH   edit a participant's username   (body: { id, username })
     DELETE  delete a participant account    (?id=… or body: { id })
   ============================================================ */

import { NextResponse } from 'next/server';
import { getUserIdFromToken } from '@/infrastructure/supabase-admin-server';
import {
  listParticipants,
  editParticipant,
  deleteParticipant,
  ParticipantValidationError,
  ParticipantAuthorizationError,
} from '@/infrastructure/supabase-admin-participants-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof ParticipantAuthorizationError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ParticipantValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  // Unexpected error: log the real cause server-side, but never leak it to the
  // client. Raw `err.message` can expose PostgREST/Postgres schema details, so
  // the response stays a generic message.
  console.error('[participants-route]', err);
  return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
}

/** Resolve the caller's user id from the bearer token, or null when unauthenticated. */
async function resolveCaller(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  return getUserIdFromToken(token);
}

export async function GET(req: Request): Promise<NextResponse> {
  const callerId = await resolveCaller(req);
  if (!callerId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  try {
    const participants = await listParticipants(callerId);
    return NextResponse.json({ participants });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
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
    const participant = await editParticipant(callerId, String(body.id ?? ''), {
      username: String(body.username ?? ''),
    });
    return NextResponse.json({ participant });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const callerId = await resolveCaller(req);
  if (!callerId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  let id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      id = String(body.id ?? '');
    } catch {
      /* no body — fall through to validation error below */
    }
  }

  try {
    await deleteParticipant(callerId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
