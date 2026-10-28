import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The relay test harness, by alias rather than a package dependency:
      // `@hnch/relay` depends on `@hnch/shared`, so depending back would be a
      // workspace cycle.
      '@hnch/relay/testing': path.resolve(import.meta.dirname, '../relay/testing/start-relay.mjs'),
      // The relay sources the harness loads import `@hnch/shared`; point them
      // at this package's source so the suite needs no prior `pnpm build`.
      '@hnch/shared': path.resolve(import.meta.dirname, './src/index.ts'),
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
