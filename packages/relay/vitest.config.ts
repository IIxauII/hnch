import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @hnch/shared directly from TypeScript source so relay tests
      // don't require a prior `pnpm build` of the shared package.
      '@hnch/shared': path.resolve(import.meta.dirname, '../shared/src/index.ts'),
    },
  },
})
