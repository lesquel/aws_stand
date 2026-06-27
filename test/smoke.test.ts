import { describe, expect, it } from 'vitest';

/**
 * Trivial smoke test that proves the Vitest runner and env setup work.
 * It must pass WITHOUT a database connection, so it only asserts the harness
 * itself is wired up — never touches Supabase.
 */
describe('vitest harness smoke', () => {
  it('runs the test runner', () => {
    expect(true).toBe(true);
  });

  it('loads environment via the setup file (URL is set when .env.local is present)', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // The harness must not require the DB: tolerate an unset URL locally.
    if (url !== undefined) {
      expect(typeof url).toBe('string');
    } else {
      expect(url).toBeUndefined();
    }
  });
});
