/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — participant cap (room-full rejection).
 *
 * Requires relay started with HNCH_ROOM_CAP=3.
 *
 * Scenes:
 *   cap-01  — lobby at capacity (3 participants)
 *   cap-02  — 4th joiner's home page after rejection (WS close 4006 → /home with toast)
 *
 * TODO Phase 1 verification: this spec requires the relay to be running with
 * HNCH_ROOM_CAP=3. If the env is not set in playwright.config.ts or via the
 * shell, the 4th joiner will succeed and cap-02 won't show rejection UI.
 * Workaround: document in runner script or .env.test.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 HNCH_ROOM_CAP=3 pnpm --filter @hnch/relay dev &
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/participant-cap.spec.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { test, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL, ONBOARDING, HOME, LOBBY, fillRoomCode } from '../fixtures/helpers';

const SHA = process.env['SCREENSHOT_SHA'] ?? 'local';
const OUT_DIR = path.resolve(__dirname, '../../../../docs/screenshots', SHA);

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
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
    await page.locator(ONBOARDING.continueBtn).click();
    await page.waitForURL(/\/home/);
  }
}

test.describe('participant cap screenshots', () => {
  test('lobby at cap + rejection UI on overflow joiner', async ({ browser }) => {
    test.setTimeout(120_000);
    const viewport = { width: 1440, height: 900 };
    const contexts: BrowserContext[] = [];

    try {
      // Host
      const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, viewport);
      contexts.push(hostCtx);
      await onboard(hostPage, 'Host');
      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      // 2 more joiners to reach cap=3
      for (const name of ['Alice', 'Bob']) {
        const { ctx, page } = await freshCtx(browser, viewport);
        contexts.push(ctx);
        await onboard(page, name);
        await page.goto(`${BASE_URL}/join`);
        await fillRoomCode(page, code);
        await page.locator('ion-button:has-text("Join")').first().click();
        await page.waitForURL(/\/lobby/);
      }

      await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await hostPage.waitForTimeout(500);

      // cap-01 — lobby at cap (3 participants)
      await shot(hostPage, 'cap-01-lobby-at-capacity');

      // 4th joiner — overflow → rejected (WS close 4006)
      const { ctx: overflowCtx, page: overflowPage } = await freshCtx(browser, viewport);
      contexts.push(overflowCtx);
      await onboard(overflowPage, 'Overflow');
      await overflowPage.locator(HOME.joinCard).click();
      await overflowPage.waitForURL(/\/join/);
      await fillRoomCode(overflowPage, code);
      await overflowPage.locator('ion-button:has-text("Join")').first().click();

      // Relay rejects with 4006 → join page navigates to /home with toast
      await overflowPage.waitForURL(/\/home/, { timeout: 10_000 });
      await overflowPage.waitForTimeout(500);

      // cap-02 — overflow joiner on /home with rejection toast
      await shot(overflowPage, 'cap-02-overflow-joiner-rejected');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });
});
