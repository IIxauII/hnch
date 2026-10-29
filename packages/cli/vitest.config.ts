import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

/** Suites that run against the run's test relay (see vitest.relay-setup.ts). */
const RELAY_SUITES = ['src/session.test.ts'];

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @hnch/shared directly from TypeScript source so CLI tests
      // don't require a prior `pnpm build` of the shared package.
      '@hnch/shared': path.resolve(import.meta.dirname, '../shared/src/index.ts'),
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
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
    },
  },
});
