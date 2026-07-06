-- ============================================================================
-- Cloud Quest · audit follow-up — explicit grant on is_admin()
--
-- is_admin() was the only SECURITY DEFINER function in the schema without an
-- explicit revoke: Supabase grants EXECUTE on every new `public` function to
-- `anon`, `authenticated`, and `service_role` explicitly at creation time (a
-- platform default privilege, not just the PUBLIC pseudo-role), so `anon`
-- could call it directly via `.rpc('is_admin')` pre-auth. Impact was low (it
-- only returns whether the CALLER is an admin — no third-party data, no
-- state change), but it broke the consistent pattern every other RPC in
-- this schema follows (explicit grants, nothing left open to anon). RLS
-- policies that call is_admin() evaluate as `authenticated`, so that grant
-- must stay; only `anon` is revoked.
-- ============================================================================

revoke execute on function public.is_admin() from anon;
