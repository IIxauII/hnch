/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — password-protected room flow.
 *
 * Four scenes:
 *   pw-00  — session settings with the password just set (host)
 *   pw-00b — lobby of a protected session (host): the lock on the summary line
 *   pw-01  — join page with password field visible (room resolved, pwd required)
 *   pw-02  — join page after wrong-password rejection (still on /join with error state)
 *
 * Two contexts: host creates a pwd-protected room; joiner triggers the scenarios.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/password-flow.spec.ts
 */
import path from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  SETTINGS_SHEET,
  expectToast,
  fillRoomCode,
} from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('password');
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

test.describe('password flow screenshots', () => {
  test('password sheet + wrong-password error @password', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, {
      width: 1440,
      height: 900,
    });
    const { ctx: joinerCtx, page: joinerPage } = await freshCtx(browser, {
      width: 1440,
      height: 900,
    });

    try {
      // Host creates session and sets a password
      await onboard(hostPage, 'Host');
      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const rawCode = (await codeEl.textContent()) ?? '';
      const code = rawCode.replaceAll(/[^A-Z0-9]/gi, '');

      // Open session settings → set password
      await hostPage.locator(LOBBY.subtitleHostBtn).click();
      await hostPage.locator('app-session-settings-sheet').waitFor({ state: 'visible' });
      // Wait for relay PATCH to commit before joiner attempts
      const patched = hostPage.waitForResponse(
        (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
        { timeout: 10_000 },
      );
      const pwInput = hostPage.locator(SETTINGS_SHEET.passwordInput).locator('input');
      await pwInput.fill('secret123');
      await pwInput.press('Enter');
      await patched;
      await expectToast(hostPage, 'Password set');
      await hostPage.locator(SETTINGS_SHEET.removePasswordBtn).waitFor({ state: 'visible' });
      // Any toast that is up — see capture.spec.ts.
      await expect(hostPage.locator('ion-toast:not(.overlay-hidden)')).toHaveCount(0, {
        timeout: 5_000,
      });

      // pw-00 — session settings, password set
      await shot(hostPage, 'pw-00-session-settings-password-set');

      await hostPage.locator(SETTINGS_SHEET.doneBtn).click();
      await hostPage.locator('app-session-settings-sheet').waitFor({ state: 'hidden' });

      // pw-00b — lobby of a protected session
      await shot(hostPage, 'pw-00b-lobby-protected');

      // Joiner navigates to join page
      await onboard(joinerPage, 'Joiner');
      await joinerPage.locator(HOME.joinCard).click();
      await joinerPage.waitForURL(/\/join/);
      await fillRoomCode(joinerPage, code);
      // The sixth character submits: no Join tap after a typed code.
      const pwField = joinerPage.locator(JOIN.passwordInput).locator('input');
      await pwField.waitFor({ state: 'visible', timeout: 8_000 });
      await joinerPage.waitForTimeout(400);

      // pw-01 — password field visible
      await shot(joinerPage, 'pw-01-join-password-field');

      // Enter wrong password and submit
      await pwField.fill('wrongpassword');
      await joinerPage.locator(JOIN.joinBtn).click();
      // Wait for rejection to surface — stay on /join
      await expectToast(joinerPage, 'That password is incorrect');

      // pw-02 — wrong-password rejection (still on /join)
      await shot(joinerPage, 'pw-02-join-wrong-password');
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});
