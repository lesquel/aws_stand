import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests talk to a real remote Supabase, so they run in Node.
    environment: 'node',
    // Load .env.local (URL, anon key, service-role key, admin emails) before any test.
    setupFiles: ['./test/setup-env.ts'],
    include: ['test/**/*.test.ts'],
    // Supabase round-trips can be slow; keep a generous default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
