import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../domain/types';

// New multi-event schema: profiles holds identity only (no progress column —
// progress moved to `participations`; no stand_id — staff assignment is SP3).
interface ProfileRow {
  id: string;
  username: string;
  base_id: string;
  role: 'participant' | 'staff' | 'admin';
}

export interface ProfileData {
  username: string;
  baseId: string;
  role: Role;
}

// Map the DB role to the app's role model. The DB stores 'participant' for the
// default player; the app calls that 'player'. 'staff' and 'admin' pass through
// unchanged so route guards and SP2's admin console can branch on them.
// Exported for direct unit coverage of the mapping.
export function toAppRole(role: ProfileRow['role']): Role {
  if (role === 'staff') return 'staff';
  if (role === 'admin') return 'admin';
  return 'player';
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<ProfileData | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,base_id,role')
    .eq('id', userId)
    .single<ProfileRow>();
  if (error || !data) return null;
  return {
    username: data.username,
    baseId: data.base_id,
    role: toAppRole(data.role),
  };
}

/**
 * Server-side staff enrollment via RPC.
 * The RPC validates the access code and updates role + stand_id atomically.
 * Returns true on success, false if the code is wrong or the stand id is invalid.
 */
export async function becomeStaffRpc(
  supabase: SupabaseClient,
  standId: string,
  accessCode: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('become_staff', {
    p_stand_id: standId,
    p_access_code: accessCode,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Change stand for an already-enrolled staff member.
 * The RPC verifies the caller's role is 'staff' before updating.
 * Returns true on success.
 */
export async function changeStandRpc(
  supabase: SupabaseClient,
  standId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('change_stand', {
    p_stand_id: standId,
  });
  if (error) throw error;
  return data === true;
}
