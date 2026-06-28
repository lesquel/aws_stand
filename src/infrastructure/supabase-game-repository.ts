import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../domain/types';

// New multi-event schema: profiles holds identity only (no progress column —
// progress moved to `participations`; no stand_id — staff assignment is SP3).
interface ProfileRow {
  id: string;
  username: string;
  base_id: string;
  role: 'participant' | 'staff' | 'admin';
  // Unique per participant (RN-01). The value the staff scanner reads and passes
  // to `approve_completion`; the player renders it as a scannable QR (CA-02).
  qr_token: string;
}

export interface ProfileData {
  username: string;
  baseId: string;
  role: Role;
  qrToken: string;
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

// Pure row → app-profile mapping. Extracted for direct unit coverage so the
// qr_token threading (DB → player state) is verified without a database.
export function mapProfileRow(row: ProfileRow): ProfileData {
  return {
    username: row.username,
    baseId: row.base_id,
    role: toAppRole(row.role),
    qrToken: row.qr_token,
  };
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<ProfileData | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,base_id,role,qr_token')
    .eq('id', userId)
    .single<ProfileRow>();
  if (error || !data) return null;
  return mapProfileRow(data);
}
