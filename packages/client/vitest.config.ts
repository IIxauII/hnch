import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      jit: true,
      tsconfig: 'tsconfig.vitest.json',
    }),
  ],
  test: {
    // At least 2 workers. Vitest's default is CPUs - 1, so a 2-CPU machine
    // (a hosted CI runner while the repo is private) gets 1, and with a
    // single worker it runs every file in one process: @angular/core/testing
    // stays loaded and test-setup.ts's initTestEnvironment throws for every
    // file after the first.
    maxWorkers: Math.max(2, availableParallelism() - 1),
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          include: ['src/**/*.test.ts'],
          environment: 'jsdom',
          globalSetup: ['src/vitest.global-setup.ts'],
          setupFiles: ['src/test-setup.ts'],
          globals: true,
          restoreMocks: true,
          server: {
            deps: {
              inline: ['@ionic/core'],
            },
          },
        },
      },
      // Node-side: the hnch-web deploy guard (scripts/deploy-guard.mjs).
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        'src/main.ts',
        'src/polyfills.ts',
        'src/zone-flags.ts',
        'src/test-setup.ts',
        'src/vitest.global-setup.ts',
        'src/environments/version.ts',
      ],
    },
  },
});
