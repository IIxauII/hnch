/**
 * Playwright globalSetup: warn if relay reuse may cause test failures.
 *
 * If an already-running relay (from `pnpm dev:relay`) is reused instead of
 * spawned fresh, it lacks HNCH_ENABLE_TEST_ROUTES=1 and HNCH_ROOM_CAP=3,
 * causing tests to hit production limits and fail mysteriously.
 * This hook prints a warning (non-CI only) to alert the developer.
 */

export default async () => {
  // Skip in CI — CI always spawns a fresh relay with correct env vars.
  if (process.env['CI']) {
    return
  }

  const RELAY_PORT = process.env['RELAY_PORT'] ?? '1234'

  console.warn(`
⚠  Playwright may reuse an already-running relay on port ${RELAY_PORT}.
   If your relay was started with \`pnpm dev:relay\` (no test-mode env vars),
   tests will run against production room caps and the eviction route will
   return 404 — failures will look like flake. To run tests cleanly:
     • stop any local \`pnpm dev:relay\` first, OR
     • start the relay with HNCH_ENABLE_TEST_ROUTES=1 HNCH_ROOM_CAP=3.
`)
}
