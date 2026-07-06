-- ============================================================================
-- Cloud Quest · audit follow-up — revoke `anon` EXECUTE on every RPC
--
-- Root cause: Supabase grants EXECUTE on every new `public` function to
-- `anon`, `authenticated`, and `service_role` explicitly at creation time (a
-- platform default privilege, not just the PUBLIC pseudo-role). None of the
-- migrations that created these SECURITY DEFINER functions revoked the
-- `anon` grant, so every one of them was callable by an unauthenticated
-- caller holding only the public anon key.
--
-- Most of them fail closed for a null `auth.uid()` (the caller): join_event
-- hits a NOT NULL constraint, approve_completion/correct_points/
-- admin_upsert_stand/validate_winner/list_point_corrections/
-- find_participation_for_correction all explicitly check `is_admin()` or a
-- `staff_assignments`/ownership match against `auth.uid()`, and `NULL = x`
-- is never true in SQL, so those raise an authorization exception for an
-- anonymous caller.
--
-- `event_leaderboard(uuid)` (migration 0004) is the exception: it has NO
-- internal identity check at all — it is filtered only by the event's
-- `status = 'active'`. With the default anon grant still in place, ANY
-- unauthenticated caller with just the public anon key could call
-- `event_leaderboard` for any active event and read every participant's
-- username, tickets, and badges_count — a real cross-user data leak with
-- zero authentication required. Caught in a fresh-eyes review of the
-- is_admin()-only version of this migration.
--
-- Fix: revoke EXECUTE on every SECURITY DEFINER RPC in the schema, from BOTH
-- `anon` (Supabase's explicit per-function default grant) AND `public` (the
-- Postgres pseudo-role every new function grants EXECUTE to by default,
-- which `anon` also inherits — revoking only `anon` and leaving the `public`
-- grant in place does NOT close the hole, since `anon` is implicitly a
-- member of `public`; both revokes are required, confirmed against the live
-- ACL). Every one of these RPCs is only ever called by the app AFTER a
-- session exists (see the client repositories under src/infrastructure/) —
-- there is no pre-auth flow that needs anon access to any of them.
-- `authenticated` keeps EXECUTE throughout; RLS policies that call
-- is_admin() evaluate as that role.
-- ============================================================================

revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.handle_new_user() from anon, public;
revoke execute on function public.join_event(uuid) from anon, public;
revoke execute on function public.admin_upsert_stand(jsonb) from anon, public;
revoke execute on function public.approve_completion(text, uuid, int) from anon, public;
revoke execute on function public.event_leaderboard(uuid) from anon, public;
revoke execute on function public.correct_points(uuid, int, text) from anon, public;
revoke execute on function public.list_point_corrections(uuid) from anon, public;
revoke execute on function public.find_participation_for_correction(text, uuid) from anon, public;
revoke execute on function public.validate_winner(text, uuid) from anon, public;
revoke execute on function public.claim_prize(uuid, text) from anon, public;
