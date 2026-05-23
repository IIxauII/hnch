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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        'src/main.ts',
        'src/polyfills.ts',
        'src/zone-flags.ts',
        'src/test-setup.ts',
        'src/test.ts',
        'src/vitest.global-setup.ts',
        'src/environments/version.ts',
      ],
    },
  },
});
