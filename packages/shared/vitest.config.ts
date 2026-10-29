import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The relay test harness, by alias rather than a package dependency:
      // `@hnch/relay` depends on `@hnch/shared`, so depending back would be a
      // workspace cycle.
      // The harness runs the relay Worker on workerd, which bundles this
      // package's built leaf modules: run `pnpm --filter @hnch/shared build` first.
      '@hnch/relay/testing': path.resolve(import.meta.dirname, '../relay/testing/start-relay.mjs'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', 'src/index.ts'],
    },
  },
});
