/**
 * `@hnch/relay/testing` — start a relay for a test suite.
 *
 * Phase 1a backs this with the in-process Node relay (its TypeScript sources,
 * so it is importable only under vitest/tsx). Phase 1b swaps the backing for
 * `wrangler dev` on a free port behind the same API; consumers use nothing
 * but `startTestRelay`, so they do not change.
 */

import { createCodePool } from '../src/code-pool.ts';
import { createRoomStore } from '../src/room-store.ts';
import { createRelayServer } from '../src/server.ts';

/**
 * @param {import('./start-relay.d.mts').StartTestRelayOptions} [_opts]
 * @returns {Promise<import('./start-relay.d.mts').TestRelay>}
 */
export async function startTestRelay(_opts = {}) {
  const server = createRelayServer({ roomStore: createRoomStore(createCodePool()) });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
    });
  });
  const httpUrl = `http://localhost:${port}`;
  return {
    httpUrl,
    wsUrl: httpUrl.replace(/^http/, 'ws'),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
