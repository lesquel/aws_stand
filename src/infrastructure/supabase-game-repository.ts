import type { SupabaseClient } from '@supabase/supabase-js';
import type { Progress } from '../domain/types';
import { emptyProgress } from '../domain/progress';

interface ProfileRow {
  id: string;
  username: string;
  base_id: string;
  role: 'player' | 'staff';
  stand_id: string | null;
  progress: Progress;
  updated_at: string;
}

export interface ProfileData {
  username: string;
  baseId: string;
  role: 'player' | 'staff';
  standId: string | undefined;
  progress: Progress;
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<ProfileData | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<ProfileRow>();
  if (error || !data) return null;
  return {
    username: data.username,
    baseId: data.base_id,
    role: data.role,
    standId: data.stand_id ?? undefined,
    progress: (data.progress as Progress) || emptyProgress(),
  };
}

export async function saveProgress(supabase: SupabaseClient, userId: string, progress: Progress): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ progress, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
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
