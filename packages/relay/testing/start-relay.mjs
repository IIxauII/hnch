// @ts-check
/**
 * `@hnch/relay/testing` — start a relay for a test suite.
 *
 * Runs the real relay Worker on workerd through `scripts/dev.mjs`, on a free
 * port with its own empty state directory, and waits for `/health`. Needs
 * `@hnch/shared` built, as the relay imports its leaf modules.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DEV_SCRIPT = resolve(import.meta.dirname, '../scripts/dev.mjs');
const READY_TIMEOUT_MS = 30_000;
/** Lines of relay output kept for the error if it fails to start. */
const OUTPUT_TAIL = 40;
/** Characters of relay output kept for `TestRelay.output()`: the last 256 Ki. */
const OUTPUT_KEPT = 256 * 1024;

/** Start attempts: relays starting at once can race for a port. */
const START_ATTEMPTS = 3;

/**
 * @param {import('./start-relay.d.mts').StartTestRelayOptions} [opts]
 * @returns {Promise<import('./start-relay.d.mts').TestRelay>}
 */
export async function startTestRelay(opts = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await startOnce(opts);
    } catch (err) {
      const portRace = /address already in use/i.test(String(err));
      if (!portRace || attempt >= START_ATTEMPTS) throw err;
    }
  }
}

/**
 * @param {import('./start-relay.d.mts').StartTestRelayOptions} opts
 * @returns {Promise<import('./start-relay.d.mts').TestRelay>}
 */
async function startOnce(opts) {
  const port = await freePort();
  const state = mkdtempSync(join(tmpdir(), 'hnch-test-relay-'));
  /** @type {Record<string, string>} */
  const vars = {};
  if (opts.roomCap !== undefined) vars['HNCH_ROOM_CAP'] = String(opts.roomCap);
  if (opts.testRoutes) vars['HNCH_ENABLE_TEST_ROUTES'] = '1';

  const child = spawn(
    process.execPath,
    [DEV_SCRIPT, '--persist-to', state, '--log-level', 'warn'],
    {
      env: {
        ...withoutTestVars(process.env),
        ...vars,
        PORT: String(port),
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so stop() can end wrangler and workerd with it.
      detached: true,
    },
  );
  /** @type {string[]} */
  const output = [];
  /** The relay's latest output, for `TestRelay.output()`. */
  let all = '';
  const keep = (/** @type {Buffer} */ chunk) => {
    const text = chunk.toString();
    all += text;
    if (all.length > OUTPUT_KEPT) all = all.slice(-OUTPUT_KEPT);
    output.push(...text.split('\n'));
    output.splice(0, Math.max(0, output.length - OUTPUT_TAIL));
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));

  const httpUrl = `http://localhost:${port}`;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
    await exited;
    await untilRefused(port);
    rmSync(state, { recursive: true, force: true });
  };

  try {
    await untilHealthy(httpUrl, exited);
  } catch (err) {
    await stop();
    const detail = output.filter((line) => line.trim() !== '').join('\n');
    throw new Error(`test relay did not start: ${String(err)}\n${detail}`, { cause: err });
  }

  return {
    httpUrl,
    wsUrl: httpUrl.replace(/^http/, 'ws'),
    output: () => all,
    stop,
  };
}

/** A port nothing listens on right now. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => (port > 0 ? resolvePort(port) : reject(new Error('no free port'))));
    });
  });
}

/**
 * @param {string} httpUrl
 * @param {Promise<unknown>} exited
 */
async function untilHealthy(httpUrl, exited) {
  let gone = false;
  void exited.then(() => {
    gone = true;
  });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (gone) throw new Error('relay process exited');
    try {
      const res = await fetch(`${httpUrl}/health`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no /health within ${READY_TIMEOUT_MS / 1000} s`);
}

/** Resolves once connecting to `port` is refused. */
async function untilRefused(/** @type {number} */ port) {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * The caller's environment minus the ADR-0027 vars, so a suite run inside the
 * e2e environment still gets a production-default relay unless it asks.
 * @param {NodeJS.ProcessEnv} env
 */
function withoutTestVars(env) {
  const { HNCH_ROOM_CAP: _cap, HNCH_ENABLE_TEST_ROUTES: _routes, ...rest } = env;
  return rest;
}
