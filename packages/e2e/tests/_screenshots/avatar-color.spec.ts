/* eslint-disable max-lines-per-function -- linear screenshot tour */
/**
 * Screenshot capture for ADR-0043 / issue #159 avatar color feature.
 *
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/avatar-color.spec.ts
 *
 * Writes PNGs into .claude/screens/avatar-color/. Opt-in via
 * SCREENSHOT_CAPTURE=1.
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';

import { BASE_URL, ONBOARDING, HOME, LOBBY, ROUND_START, ESTIMATING } from '../fixtures/helpers';

const OUT_DIR = path.resolve(__dirname, '../../../../.claude/screens/avatar-color');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function freshContext(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page, name: string): Promise<void> {
  await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForURL(/\/settings/);
  await page.locator('app-settings').waitFor({ state: 'visible' });
  // Wait for swatch grid render.
  await page.locator('.avatar-color-item .swatches .swatch').first().waitFor({ state: 'visible' });
}

async function pickPaletteSwatch(page: Page, ariaLabel: string): Promise<void> {
  await page.locator(`.avatar-color-item .swatch[aria-label="${ariaLabel}"]`).click();
  await page.waitForTimeout(150);
}

async function createSession(page: Page): Promise<void> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
}

async function captureSet(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
  tag: string,
): Promise<void> {
  const { ctx, page } = await freshContext(browser, viewport, colorScheme);
  try {
    // 1 — settings with avatar color picker (default state, deterministic seed).
    await page.goto(`${BASE_URL}/home`);
    await page.waitForURL(/\/onboarding/);
    await onboard(page, 'Alex');
    await gotoSettings(page);
    await shot(page, `01-settings-default-${tag}`);

    // 2 — settings after picking "Pink".
    await pickPaletteSwatch(page, 'Pink');
    await shot(page, `02-settings-pink-${tag}`);

    // 3 — lobby with the chosen color on the host avatar.
    await page.goto(`${BASE_URL}/home`);
    await page.waitForURL(/\/home/);
    await createSession(page);
    await shot(page, `03-lobby-pink-avatar-${tag}`);

    // 4 — estimating with self-vote dot colored.
    const startBtn = page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startBtn.evaluate((el: HTMLElement) => el.click());
    await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: 'Round title' }).fill('Auth flow');
    await page.locator(ROUND_START.startBtn).evaluate((el: HTMLElement) => el.click());
    await page.waitForURL(/\/estimating/);
    await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    await page.locator(ESTIMATING.card('5')).first().click();
    await page.locator(ESTIMATING.selectedCard).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await shot(page, `04-estimating-pink-dot-${tag}`);
  } finally {
    await ctx.close();
  }
}

test.describe('avatar color screenshots', () => {
  test('desktop 1440 light', async ({ browser }) => {
    test.setTimeout(120_000);
    await captureSet(browser, { width: 1440, height: 900 }, 'light', 'desktop-1440-light');
  });

  test('desktop 1440 dark', async ({ browser }) => {
    test.setTimeout(120_000);
    await captureSet(browser, { width: 1440, height: 900 }, 'dark', 'desktop-1440-dark');
  });

  test('mobile 390 light', async ({ browser }) => {
    test.setTimeout(120_000);
    await captureSet(browser, { width: 390, height: 844 }, 'light', 'mobile-390-light');
  });

  test('mobile 390 dark', async ({ browser }) => {
    test.setTimeout(120_000);
    await captureSet(browser, { width: 390, height: 844 }, 'dark', 'mobile-390-dark');
  });
});
