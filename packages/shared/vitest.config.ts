import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

/** Suites that run against the run's test relay (see vitest.relay-setup.ts). */
const RELAY_SUITES = ['src/live-session.test.ts'];

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
    projects: [
      {
        extends: true,
        test: { name: 'unit', exclude: [...configDefaults.exclude, ...RELAY_SUITES] },
      },
      // Its own project so the relay starts only when one of these suites runs.
      {
        extends: true,
        test: { name: 'relay', include: RELAY_SUITES, globalSetup: ['./vitest.relay-setup.ts'] },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', 'src/index.ts'],
    },
  },
});
