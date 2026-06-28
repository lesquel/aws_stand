import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The admin server modules `import 'server-only'`, whose default export throws
  // to block client bundling. Next.js neutralizes it at build via the
  // `react-server` export condition; Vitest's SSR resolver doesn't apply that
  // condition, so the integration tests (which legitimately import those
  // server-only modules) would crash on import. Alias `server-only` to its own
  // no-op `empty.js` (the file Next resolves to) so the guard is inert in tests.
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
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
