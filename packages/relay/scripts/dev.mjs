#!/usr/bin/env node
// @ts-check
/**
 * Runs the relay locally on workerd: `pnpm --filter @hnch/relay dev`, which is
 * also what `pnpm dev:relay`, the e2e webServer and `@hnch/relay/testing` run.
 *
 * Maps the environment the Node relay read onto `wrangler dev`:
 *
 *   PORT                      → --port (default 1234)
 *   HOST                      → --ip   (default 0.0.0.0, as the Node relay)
 *   HNCH_ENABLE_TEST_ROUTES   → --var, only when set (ADR-0027)
 *   HNCH_ROOM_CAP             → --var, only when set (ADR-0027)
 *
 * Always passes JURISDICTION:none: local workerd has no jurisdictions. With a
 * test var set, the relay starts from empty state in a temporary directory, so
 * test runs never see each other's rooms; plain dev keeps .wrangler/state.
 * Extra arguments go to wrangler as they are (e.g. `--persist-to <dir>`).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const relayDir = resolve(import.meta.dirname, '..');
const env = process.env;
const extraArgs = process.argv.slice(2);

const args = [
  'dev',
  '--port',
  env['PORT'] || '1234',
  '--ip',
  env['HOST'] || '0.0.0.0',
  '--var',
  'JURISDICTION:none',
  '--show-interactive-dev-session=false',
];

const testVars = /** @type {const} */ (['HNCH_ENABLE_TEST_ROUTES', 'HNCH_ROOM_CAP']).filter(
  (name) => env[name] !== undefined && env[name] !== '',
);
for (const name of testVars) args.push('--var', `${name}:${env[name]}`);

/** @type {string | null} */
let tempState = null;
if (testVars.length > 0 && !extraArgs.some((a) => a.startsWith('--persist-to'))) {
  tempState = mkdtempSync(join(tmpdir(), 'hnch-relay-'));
  args.push('--persist-to', tempState);
}
args.push(...extraArgs);

const wranglerBin = join(
  dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
  'bin',
  'wrangler.js',
);
const wrangler = spawn(process.execPath, [wranglerBin, ...args], {
  cwd: relayDir,
  stdio: 'inherit',
  env: { ...env, WRANGLER_SEND_METRICS: 'false' },
});

function cleanUp() {
  if (tempState !== null) rmSync(tempState, { recursive: true, force: true });
  tempState = null;
}

for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => wrangler.kill(signal));
}
wrangler.on('exit', (code, signal) => {
  cleanUp();
  process.exit(code ?? (signal ? 1 : 0));
});
