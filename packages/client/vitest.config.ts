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
    server: {
      deps: {
        inline: ['@ionic/core'],
      },
    },
  },
});
