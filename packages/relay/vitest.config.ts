import path from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';

// The relay imports these leaf modules of @hnch/shared; point them at source so
// the suite needs no prior `pnpm build` of the shared package.
const sharedSource = Object.fromEntries(
  ['room-code', 'auth', 'health'].map((m) => [
    `@hnch/shared/${m}`,
    path.resolve(import.meta.dirname, `../shared/src/${m}.ts`),
  ]),
);

/** Tests that run inside workerd against the Worker in wrangler.jsonc. */
function workerProject(
  name: string,
  vars: Record<string, string>,
  test: TestProjectInlineConfiguration['test'],
): TestProjectInlineConfiguration {
  return {
    resolve: { alias: sharedSource },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // Local workerd has no jurisdictions.
        miniflare: { bindings: { JURISDICTION: 'none', ...vars } },
      }),
    ],
    test: { name, ...test },
  };
}

export default defineConfig({
  test: {
    projects: [
      workerProject(
        'worker',
        {},
        {
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.test-vars.test.ts'],
        },
      ),
      // The ADR-0027 test vars as the e2e relay runs them.
      workerProject(
        'worker-test-vars',
        { HNCH_ROOM_CAP: '3', HNCH_ENABLE_TEST_ROUTES: '1' },
        { include: ['src/**/*.test-vars.test.ts'] },
      ),
      // Node-side: the @hnch/relay/testing harness, which runs the relay as a
      // process, and the deploy guard.
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['testing/**/*.test.ts', 'scripts/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Run after both worker projects, not beside them: the harness test
          // starts several `wrangler dev` processes (esbuild + workerd), and
          // the workerd tests slowed down while it did on the shared CI
          // runner. The worker projects keep the default group order 0.
          sequence: { groupOrder: 1 },
        },
      },
    ],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'src/test-support/**'],
    },
  },
});
