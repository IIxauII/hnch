#!/usr/bin/env node
// Reads package.json `version`, writes src/environments/version.ts.
// Run automatically on postinstall, prebuild, prestart. Idempotent.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const outPath = resolve(here, '..', 'src', 'environments', 'version.ts');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version;
if (typeof version !== 'string' || version.length === 0) {
  console.error(`generate-version: package.json has no usable "version" field`);
  process.exit(1);
}

const body = `// GENERATED FILE — do not edit. Run \`pnpm generate-version\` to regenerate.\nexport const APP_VERSION = '${version}'\n`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, body, 'utf8');
console.log(`generate-version: wrote ${outPath} (${version})`);
