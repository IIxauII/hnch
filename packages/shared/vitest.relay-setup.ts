/**
 * Global setup of the `relay` test project: one relay for the whole run.
 *
 * Starts the real relay through the `@hnch/relay/testing` harness before any
 * test file runs and stops it once the run ends; suites read its base URL with
 * `testRelayUrl()` from `vitest.relay-url.ts`. Started here rather than in a
 * suite's `beforeAll`, the `wrangler dev` spawn (esbuild + workerd) runs once,
 * outside any hook timeout, before test workers compete with it for the CPU.
 * The harness bounds the start: 2 s per `/health` attempt, 30 s in all.
 *
 * The relay is shared by every suite in the project, so a suite works only in
 * rooms it mints itself and never relies on a fresh relay. It runs with the
 * production defaults: a suite that needs the ADR-0027 test vars (test routes,
 * a lower room cap) starts its own with `startTestRelay(opts)`.
 */

import { startTestRelay } from '@hnch/relay/testing';
import type { TestProject } from 'vitest/node';
import type { TestRelayUrlKey } from './vitest.relay-url.js';

const KEY: TestRelayUrlKey = 'testRelayUrl';

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const started = Date.now();
  const relay = await startTestRelay();
  console.log(`[vitest] test relay up at ${relay.httpUrl} in ${Date.now() - started} ms`);
  project.provide(KEY, relay.httpUrl);
  return () => relay.stop();
}
