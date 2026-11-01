/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — connection banner, disconnected state.
 *
 * Scene:
 *   conn-01  — lobby with the "Reconnecting…" banner after the connection drops
 *
 * Ordering invariant: setOffline(true) → banner visible → screenshot.
 * The banner is the app's one connection indicator. It shows as soon as a
 * connection that was up is known to be down, and stays in view when the page
 * scrolls.
 *
 * Only the disconnected variant is captured here — connected state renders
 * nothing by design (computeBannerLabel returns null for 'connected'). The
 * reconnected shot (banner gone) is in capture.spec.ts scene 8c.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/connection-states.spec.ts
 */
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './_helpers/capture-test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  CONNECTION_BANNER,
  rememberedSessionCodes,
} from '../fixtures/helpers';
import { resolveOutDir } from './_helpers/out-dir';
import { pageSettled } from './_helpers/settled';

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
  await pageSettled(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

test.describe('connection banner — disconnected state', () => {
  for (const [vpName, viewport] of [
    ['1440', { width: 1440, height: 900 }],
    ['390', { width: 390, height: 844 }],
  ] as const) {
    test(`reconnecting banner after the connection drops (${vpName}) @connection`, async ({
      browser,
    }) => {
      test.setTimeout(60_000);
      const { ctx, page } = await freshCtx(browser, viewport);

      try {
        // Onboard and create a session so we land on /lobby where the banner lives
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
        // Connected and in sync — which is when the device remembers the
        // session. A connection that was never up has nothing to *re*connect.
        await expect.poll(() => rememberedSessionCodes(page), { timeout: 15_000 }).toHaveLength(1);

        await ctx.setOffline(true);

        const banner = page.locator(`app-lobby:not(.ion-page-hidden) ${CONNECTION_BANNER.banner}`);
        await banner.waitFor({ state: 'visible', timeout: 15_000 });
        await expect(banner).toContainText('Reconnecting');

        // The toolbar holds nothing about the connection: the title is whole,
        // and beside it are the two buttons that are always there.
        const toolbar = page.locator('app-lobby:not(.ion-page-hidden) ion-header ion-toolbar');
        await expect(toolbar.locator('ion-title')).toHaveText('Lobby');
        await expect(toolbar.locator('ion-buttons > *')).toHaveCount(2);
        await expect(toolbar.locator('ion-chip, ion-badge, ion-spinner')).toHaveCount(0);

        // conn-01 — "Reconnecting…" banner
        await shot(page, `conn-01-reconnecting-banner-${vpName}`);
      } finally {
        // Re-enable network before closing to avoid pending request errors
        await ctx.setOffline(false).catch(() => undefined);
        await ctx.close();
      }
    });
  }
});
