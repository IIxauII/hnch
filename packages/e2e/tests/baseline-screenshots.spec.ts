/**
 * baseline-screenshots.spec.ts
 *
 * Captures v2 design baseline screenshots at:
 *   - 1440 x 900  (desktop split-pane)
 *   - 390  x 844  (mobile)
 *
 * Screenshots saved to packages/e2e/baseline-screens/v2-{route}-{w}.png.
 * These are reference captures, NOT snapshot-comparison tests — the suite
 * does not assert pixel equality. Run with `--grep baseline` to regenerate.
 *
 * Captured routes:
 *   home       — /home (public rail on desktop)
 *   join       — /join (join flow)
 *   lobby      — /lobby/:code (pre-round)
 *   estimating — /estimating (mid-round, all voted, before reveal)
 *   settings   — /settings (app settings page)
 */

import * as path from 'path';
import { test } from './fixtures/app.fixture';
import { BASE_URL } from './fixtures/helpers';

const BASELINE_DIR = path.resolve(__dirname, '../baseline-screens');

const VIEWPORTS = [
  { width: 1440, height: 900, tag: '1440' },
  { width: 390, height: 844, tag: '390' },
] as const;

async function captureRoute(
  page: import('@playwright/test').Page,
  route: string,
  tag: string,
): Promise<void> {
  const name = `v2-${route}-${tag}.png`;
  await page.screenshot({
    path: path.join(BASELINE_DIR, name),
    fullPage: false,
  });
}

test.describe('Baseline screenshots @baseline', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.width}x${vp.height}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test(`home + join + lobby + estimating + settings [${vp.tag}]`, async ({ host, player }) => {
        // ---- home ----
        await host.page.goto(`${BASE_URL}/home`);
        await host.page.waitForURL(/\/(home|onboarding)/u);
        if (host.page.url().includes('/onboarding')) {
          await host.onboard();
        }
        await host.page.waitForURL(/\/home/u);
        await host.page.waitForLoadState('networkidle');
        await captureRoute(host.page, 'home', vp.tag);

        // ---- join ----
        await host.page.locator('ion-button:has-text("Join room")').click();
        await host.page.waitForURL(/\/join/u);
        await host.page.waitForLoadState('networkidle');
        await captureRoute(host.page, 'join', vp.tag);

        // ---- lobby (pre-round) ----
        const code = await host.createSession();
        await player.joinSession(code);
        await host.page.waitForURL(/\/lobby/u);
        await host.page.waitForLoadState('networkidle');
        await captureRoute(host.page, 'lobby', vp.tag);

        // ---- estimating ----
        await host.startRound('ACME-123');
        await player.waitForEstimating();
        // Cast votes but do not reveal — capture mid-round state
        await host.castVote('5');
        // player has voted → unanimous would reveal; don't cast player vote
        // to keep the estimating screen open
        await host.page.waitForURL(/\/estimating/u);
        await host.page.waitForLoadState('networkidle');
        await captureRoute(host.page, 'estimating', vp.tag);

        // ---- settings ----
        await host.page.goto(`${BASE_URL}/settings`);
        await host.page.waitForURL(/\/settings/u);
        await host.page.waitForLoadState('networkidle');
        await captureRoute(host.page, 'settings', vp.tag);
      });
    });
  }
});
