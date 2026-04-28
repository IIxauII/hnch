import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node22',
  platform: 'node',
  bundle: true,
  minify: true,
  sourcemap: false,
  splitting: false,
  clean: true,
  dts: false,
  shims: false,
  treeshake: true,
  banner: { js: '#!/usr/bin/env node' },
});
