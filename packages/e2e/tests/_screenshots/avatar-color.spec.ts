/* eslint-disable max-lines-per-function -- linear screenshot tour */
/**
 * Screenshot capture for ADR-0043 / issue #159 avatar color feature.
 *
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/avatar-color.spec.ts
 *
 * Writes PNGs into docs/screenshots/<SHA>/ (SHA defaults to `local`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';

import { BASE_URL, ONBOARDING, HOME, LOBBY, ROUND_START, ESTIMATING } from '../fixtures/helpers';

const SHA = process.env['SCREENSHOT_SHA'] ?? 'local';
const OUT_DIR = path.resolve(__dirname, '../../../../docs/screenshots', SHA);

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
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
  await page.locator('ion-select[label="Avatar color"]').waitFor({ state: 'visible' });
}

async function pickPaletteOption(page: Page, label: string): Promise<void> {
  const select = page.locator('ion-select[label="Avatar color"]');
  await select.click();
  await page.locator('ion-popover ion-radio', { hasText: label }).first().click();
  await page.waitForTimeout(200);
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
    await pickPaletteOption(page, 'Pink');
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
    await startBtn.click();
    await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
    // Settle wait: matches capture.spec.ts. Mobile bottom-sheet animates ~300ms;
    // clicking before settle lands on the backdrop, which silently dismisses
    // the sheet without navigating → 2-min timeout. Pattern from capture.spec.ts.
    await page.waitForTimeout(400);
    await page.locator(ROUND_START.titleInput).locator('input').fill('Auth flow');
    // Blur the input before clicking the footer button. On mobile viewports
    // the focused input shifts/scrolls the sheet enough that the next click
    // can land on the backdrop instead of the button — silently dismisses
    // the sheet without navigating, then waitForURL hangs for the full
    // test timeout.
    await page.locator(ROUND_START.titleInput).locator('input').blur();
    // Drag-up the sheet handle to full breakpoint before clicking the footer
    // button. The half-sheet's `initialBreakpoint=0.6` leaves the Start
    // button just inside the viewport — but on small viewports Playwright's
    // click can land on the sheet's drag handle or backdrop instead of the
    // button itself. Expanding the sheet first eliminates the layer race.
    const handle = page.locator('app-round-start-sheet').locator('xpath=ancestor::ion-modal');
    await handle.evaluate(
      (modal: HTMLElement & { setCurrentBreakpoint?: (b: number) => Promise<void> }) => {
        if (typeof modal.setCurrentBreakpoint === 'function') {
          return modal.setCurrentBreakpoint(0.95);
        }
        return undefined;
      },
    );
    await page.waitForTimeout(400);
    await page.locator(ROUND_START.startBtn).scrollIntoViewIfNeeded();
    await page.locator(ROUND_START.startBtn).click();
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
  test('desktop 1440 light @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 1440, height: 900 }, 'light', 'desktop-1440-light');
  });

  test('desktop 1440 dark @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 1440, height: 900 }, 'dark', 'desktop-1440-dark');
  });

  test('mobile 390 light @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 390, height: 844 }, 'light', 'mobile-390-light');
  });

  test('mobile 390 dark @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 390, height: 844 }, 'dark', 'mobile-390-dark');
  });
});
