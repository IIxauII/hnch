/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — connection chip disconnected state.
 *
 * Scene:
 *   conn-01  — lobby with "Reconnecting…" chip visible after 5.5 s offline
 *
 * Ordering invariant: setOffline(true) → waitForTimeout(5_500) → screenshot.
 * The chip only renders after DISCONNECTED_WARNING_DELAY_MS (5_000 ms) elapses
 * continuously. Brief blips (<5 s) stay invisible by design (ADR-0025).
 *
 * Only the disconnected variant is captured here — connected state is null/absent
 * by design (computeChipDisplay returns null for 'connected'). The reconnected
 * shot (chip disappears) is in capture.spec.ts scene 8c.
 *
 * TODO Phase 1 verification: confirm app-connection-chip selector in lobby
 * header renders ion-chip.connection-chip after 5.5 s offline. If the chip
 * does not appear, check DocService.syncStatus() signal updates on network loss.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/connection-states.spec.ts
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL, ONBOARDING, HOME, LOBBY, CONNECTION_CHIP } from '../fixtures/helpers';
import { resolveOutDir } from './_helpers/out-dir';

const OUT_DIR = resolveOutDir('connection');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function freshCtx(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

test.describe('connection chip — disconnected state', () => {
  /**
   * Ordering invariant: setOffline(true) fires before screenshot; we sustain
   * offline for ≥5,500 ms so the DISCONNECTED_WARNING_DELAY_MS debounce
   * (5,000 ms) elapses and the chip flips to visible. Shorter durations stay
   * invisible (design intent — prevents flap on network jitter).
   */
  test('disconnected chip visible after 5.5 s offline @connection', async ({ browser }) => {
    test.setTimeout(60_000);
    const viewport = { width: 1440, height: 900 };
    const { ctx, page } = await freshCtx(browser, viewport);

    try {
      // Onboard and create a session so we land on /lobby where the chip lives
      await page.goto(`${BASE_URL}/home`);
      await page.waitForURL(/\/(home|onboarding)/);
      if (page.url().includes('/onboarding')) {
        await page.locator(ONBOARDING.nameInput).locator('input').fill('CapState');
        await page.locator(ONBOARDING.continueBtn).click();
        await page.waitForURL(/\/home/);
      }
      await page.locator(HOME.createCard).click();
      await page.waitForURL(/\/lobby/);
      await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await page.waitForTimeout(500); // settle initial sync

      // Disconnect — sustain for 5,500 ms so debounce fires
      await ctx.setOffline(true);
      await page.waitForTimeout(5_500);

      // conn-01 — "Reconnecting…" chip visible (warning color)
      await shot(page, 'conn-01-disconnected-reconnecting-chip');

      // Verify chip is actually present (log for debugging, don't assert hard)
      const chipVisible = await page
        .locator(CONNECTION_CHIP.chip)
        .isVisible()
        .catch(() => false);
      if (!chipVisible) {
        // TODO Phase 1 verification: chip not visible after 5.5 s offline.
        // Check DocService.syncStatus() and DISCONNECTED_WARNING_DELAY_MS wiring.
        console.warn(
          '[conn-states] chip not visible after 5.5 s offline — screenshot may be blank',
        );
      }
    } finally {
      // Re-enable network before closing to avoid pending request errors
      await ctx.setOffline(false).catch(() => undefined);
      await ctx.close();
    }
  });
});
