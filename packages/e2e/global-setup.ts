/**
 * Playwright globalSetup:
 *
 * 1. CI: warm the Angular dev-server bundle before any worker starts. `ng
 *    serve` returns 200 on `/` once webpack-dev-server's first compile
 *    finishes, but `webServer.url` only guarantees that — it does not
 *    guarantee app-root has hydrated. The first worker to navigate still pays
 *    a real cost, which against a 20s per-test timeout can starve actual test
 *    work. By driving a real navigation here and waiting until `<app-root>`
 *    has rendered children, every per-worker first navigation lands on a
 *    fully hot server.
 *
 * 2. Local: warn if an already-running relay (from `pnpm dev:relay`) is
 *    reused without test-mode env vars (HNCH_ENABLE_TEST_ROUTES=1,
 *    HNCH_ROOM_CAP=3), which would cause mysterious "flaky" failures.
 */

import { chromium } from '@playwright/test';

export default async () => {
  if (process.env['CI']) {
    const CLIENT_PORT = process.env['CLIENT_PORT'] ?? '4200';
    const url = `http://localhost:${CLIENT_PORT}/home`;
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const deadline = Date.now() + 120_000;
    let lastErr: unknown = null;
    while (Date.now() < deadline) {
      try {
        await page.goto(url, { timeout: 30_000, waitUntil: 'load' });
        const ready = await page.evaluate(
          () => !!document.querySelector('app-root')?.children.length,
        );
        if (ready) {
          await browser.close();
          return;
        }
      } catch (err) {
        lastErr = err;
      }
      await page.waitForTimeout(500);
    }
    await browser.close();
    throw new Error(
      `globalSetup: client did not warm within 120s (last error: ${String(lastErr)})`,
    );
  }

  const RELAY_PORT = process.env['RELAY_PORT'] ?? '1234';
  console.warn(`
⚠  Playwright may reuse an already-running relay on port ${RELAY_PORT}.
   If your relay was started with \`pnpm dev:relay\` (no test-mode env vars),
   tests will run against production room caps and the eviction route will
   return 404 — failures will look like flake. To run tests cleanly:
     • stop any local \`pnpm dev:relay\` first, OR
     • start the relay with HNCH_ENABLE_TEST_ROUTES=1 HNCH_ROOM_CAP=3.
`);
};
