/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — session ended flow.
 *
 * Scenes:
 *   end-01  — host sees End Session confirm alert
 *   end-02  — joiner on /home after host ends session (toast visible)
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/session-ended.spec.ts
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

async function clickMenuOption(page: Page, text: string): Promise<void> {
  const actionSheetBtn = page.locator(`ion-action-sheet button:has-text("${text}")`);
  const popoverBtn = page.locator('ion-popover').getByRole('button', { name: text });
  await Promise.any([
    actionSheetBtn.waitFor({ state: 'visible', timeout: 5_000 }),
    popoverBtn.waitFor({ state: 'visible', timeout: 5_000 }),
  ]);
  const isActionSheet = await actionSheetBtn.isVisible().catch(() => false);
  if (isActionSheet) {
    await actionSheetBtn.evaluate((el: HTMLElement) => el.click());
  } else {
    await popoverBtn.evaluate((el: HTMLElement) => el.click());
  }
}

test.describe('session ended screenshots', () => {
  test('end session confirm alert + joiner toast on home', async ({ browser }) => {
    test.setTimeout(90_000);
    const viewport = { width: 1440, height: 900 };
    const contexts: BrowserContext[] = [];

    try {
      const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, viewport);
      contexts.push(hostCtx);
      const { ctx: playerCtx, page: playerPage } = await freshCtx(browser, viewport);
      contexts.push(playerCtx);

      await onboard(hostPage, 'Host');
      await onboard(playerPage, 'Player');

      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      await playerPage.goto(`${BASE_URL}/join`);
      await fillRoomCode(playerPage, code);
      await playerPage.locator('ion-button:has-text("Join")').first().click();
      await playerPage.waitForURL(/\/lobby/);

      // Host opens menu → "End session for everyone"
      const menuBtn = hostPage.locator('ion-header').locator('ion-button').last();
      await menuBtn.evaluate((el: HTMLElement) => el.click());
      await clickMenuOption(hostPage, 'End session for everyone');

      // Confirm alert appears
      const alert = hostPage.locator('ion-alert');
      await alert.waitFor({ state: 'visible', timeout: 5_000 });
      await hostPage.waitForTimeout(300);

      // end-01 — host sees end-session confirm alert
      await shot(hostPage, 'end-01-end-session-confirm-alert');

      // Confirm → session ends
      await hostPage.locator('ion-alert button:has-text("End session")').click();
      await hostPage.waitForURL(/\/home/, { timeout: 10_000 });

      // Joiner should land on /home with toast
      await playerPage.waitForURL(/\/home/, { timeout: 10_000 });
      await playerPage.waitForTimeout(500);

      // end-02 — joiner on /home, toast visible (or just arrived home)
      await shot(playerPage, 'end-02-joiner-home-after-session-ended');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });
});
