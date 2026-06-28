/**
 * SP3 — player QR display: profile-row mapping unit test.
 *
 * The player shows their unique QR so staff can scan it; the scanner reads the
 * raw `profiles.qr_token` and passes it to `approve_completion`. For the player
 * to render that QR, `qr_token` must flow from the DB row into the app's profile
 * shape. This covers the pure mapping (`mapProfileRow`) without a database: given
 * a profile row, the mapped result exposes `qrToken` verbatim alongside the
 * existing identity fields and role translation.
 *
 * Network-free by design — run anywhere, no Supabase required.
 */
import { describe, expect, it } from 'vitest';
import { mapProfileRow } from '../../src/infrastructure/supabase-game-repository';

describe('SP3 player QR — mapProfileRow', () => {
  it('exposes qr_token as qrToken verbatim', () => {
    const row = {
      id: 'user-1',
      username: 'Nova',
      base_id: 'aqua',
      role: 'participant' as const,
      qr_token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    };

    const mapped = mapProfileRow(row);

    expect(mapped.qrToken).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
    expect(mapped.username).toBe('Nova');
    expect(mapped.baseId).toBe('aqua');
    expect(mapped.role).toBe('player');
  });

  it('preserves the staff role and its distinct qr token', () => {
    const mapped = mapProfileRow({
      id: 'user-2',
      username: 'Staffer',
      base_id: 'robo',
      role: 'staff',
      qr_token: 'deadbeefdeadbeefdeadbeefdeadbeef',
    });

    expect(mapped.role).toBe('staff');
    expect(mapped.qrToken).toBe('deadbeefdeadbeefdeadbeefdeadbeef');
  });
});
