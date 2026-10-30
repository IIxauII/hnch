import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

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
  // `hnch --version`. Release bumps package.json before publish runs this build.
  define: { __HNCH_CLI_VERSION__: JSON.stringify(version) },
});
