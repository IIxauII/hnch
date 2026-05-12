/* eslint-disable max-lines-per-function -- long linear tour script; splitting would obscure capture order */
/**
 * Screenshot capture for .claude/screens/<sha>/.
 *
 * Drives a single host through the full UI tour at desktop (1440) and
 * mobile (390) viewports, writing 23 PNGs that mirror the layout of the
 * previous capture under .claude/screens/7057e5d/.
 *
 * Run with:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list tests/_screenshots/capture.spec.ts
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  SETTINGS_SHEET,
} from '../fixtures/helpers';

const SHA =
  process.env['SCREENSHOT_SHA'] ??
  execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

const OUT_DIR = path.resolve(__dirname, '../../../../.claude/screens', SHA);

const NAME = 'Alex';
const ROUND_TITLE = 'Implement OAuth flow';

// Disable HTML report viewer for this spec (we just want files).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function freshContext(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200); // settle animations
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page): Promise<void> {
  await page.locator(ONBOARDING.nameInput).locator('input').fill(NAME);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
}

async function gotoFresh(page: Page, urlPath: string): Promise<void> {
  await page.goto(`${BASE_URL}${urlPath}`);
}

async function createSession(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  const codeEl = page.locator(LOBBY.roomCode);
  await codeEl.waitFor({ state: 'visible' });
  const code = (await codeEl.textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

async function openHeaderMenu(page: Page): Promise<void> {
  const headerBtn = page.locator('ion-header').locator('ion-button').last();
  await headerBtn.click();
  // Either popover (desktop) or action-sheet (mobile) appears.
  await page
    .locator('ion-popover, ion-action-sheet')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

async function closeOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

test.describe.configure({ mode: 'serial' });

// Opt-in via env var so normal `playwright test` runs skip this spec.
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

test.describe('screenshot capture', () => {
  test('desktop 1440', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await freshContext(browser, { width: 1440, height: 900 });
    try {
      // 01 — onboarding (pre-onboard)
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/onboarding/);
      await shot(page, '01-onboarding-1440');

      // 02 — home
      await onboard(page);
      await shot(page, '02-home-1440');

      // 03 — home overflow menu
      await openHeaderMenu(page);
      await shot(page, '03-home-overflow-1440');
      await closeOverlay(page);

      // 04 — settings page
      await gotoFresh(page, '/settings');
      await page.waitForURL(/\/settings/);
      await page.locator('app-settings').waitFor({ state: 'visible' });
      await shot(page, '04-settings-1440');

      // 05 — join page
      await gotoFresh(page, '/join');
      await page.waitForURL(/\/join/);
      await page.locator(JOIN.codeInput).waitFor({ state: 'visible' });
      await shot(page, '05-join-1440');

      // 06 — lobby (single host)
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/home/);
      const code = await createSession(page);
      // Wait for participant list to render
      await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await shot(page, '06-lobby-1440');

      // 07 — session-settings sheet (open via subtitle)
      await page.locator(LOBBY.subtitle).click();
      await page.locator('app-session-settings-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '07-session-settings-sheet');

      // 08 — scale picker sheet (from settings sheet → tap Scale)
      await page.locator(SETTINGS_SHEET.scaleRow).click();
      await page.locator('app-scale-picker-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '08-scale-picker-sheet');
      // Dismiss scale picker → back to settings sheet
      await page.locator('app-scale-picker-sheet ion-button:has-text("Done")').click();
      await page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' });

      // 09 — access picker sheet (from settings sheet → tap Access)
      await page.locator(SETTINGS_SHEET.accessRow).click();
      await page.locator('app-access-picker-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '09-access-sheet');
      await page.locator('app-access-picker-sheet ion-button:has-text("Done")').click();
      await page.locator('app-access-picker-sheet').waitFor({ state: 'hidden' });
      // Close settings sheet
      await page.locator(SETTINGS_SHEET.doneBtn).click();
      await page.locator('app-session-settings-sheet').waitFor({ state: 'hidden' });

      // 10 — QR modal
      await page.locator('ion-item:has-text("Show QR code")').click();
      await page.locator('app-qr-display-sheet').waitFor({ state: 'visible' });
      await page.locator('app-qr-display-sheet img').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '10-qr-modal');
      await page.locator('app-qr-display-sheet ion-button:has-text("Done")').click();
      await page.locator('app-qr-display-sheet').waitFor({ state: 'hidden' });

      // 11 — lobby overflow menu
      await openHeaderMenu(page);
      await shot(page, '11-lobby-overflow');
      await closeOverlay(page);

      // 12 — round-start modal (Round 1)
      const startBtn1 = page
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startBtn1.click();
      await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '12-round-start-modal');

      // 13 — estimating (after typing title + confirming)
      await page.locator('app-round-start-sheet ion-input').locator('input').fill(ROUND_TITLE);
      await page.locator(ROUND_START.startBtn).click();
      await page.waitForURL(/\/estimating/);
      await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await page.waitForTimeout(600);
      await shot(page, '13-estimating-1440');

      // 14 — estimating with card 5 selected
      await page.locator(ESTIMATING.card('5')).first().click();
      await page.locator(ESTIMATING.selectedCard).first().waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '14-estimating-card-selected');

      // Single-voter unanimous auto-reveal → navigates to /lobby
      await page.waitForURL(/\/lobby/, { timeout: 10_000 });
      await page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
      await page.waitForTimeout(500);

      // 15 — lobby with revealed results
      await shot(page, '15-lobby-results-1440');
      void code;
    } finally {
      await ctx.close();
    }
  });

  test('mobile 390', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await freshContext(browser, { width: 390, height: 844 });
    try {
      // 23 — onboarding
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/onboarding/);
      await shot(page, '23-onboarding-390');

      // 17 — home
      await onboard(page);
      await shot(page, '17-home-390');

      // 18 — settings
      await gotoFresh(page, '/settings');
      await page.locator('app-settings').waitFor({ state: 'visible' });
      await shot(page, '18-settings-390');

      // 19 — join
      await gotoFresh(page, '/join');
      await page.locator(JOIN.codeInput).waitFor({ state: 'visible' });
      await shot(page, '19-join-390');

      // 20 — lobby
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/home/);
      await createSession(page);
      await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await shot(page, '20-lobby-390');

      // 22 — estimating
      const startBtn = page
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startBtn.evaluate((el: HTMLElement) => el.click());
      await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
      await page.locator('app-round-start-sheet ion-input').locator('input').fill(ROUND_TITLE);
      await page.locator(ROUND_START.startBtn).evaluate((el: HTMLElement) => el.click());
      await page.waitForURL(/\/estimating/);
      await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await page.waitForTimeout(600);
      await shot(page, '22-estimating-390');

      // Cast vote → unanimous auto-reveal → /lobby results
      await page.locator(ESTIMATING.card('5')).first().click();
      await page.waitForURL(/\/lobby/, { timeout: 10_000 });
      await page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
      await page.waitForTimeout(500);

      // 16 — lobby results mobile
      await shot(page, '16-lobby-results-390');

      // 21 — round-start modal for Round 2
      const nextBtn = page.locator('ion-button').filter({ hasText: LOBBY.nextRoundBtn });
      await nextBtn.evaluate((el: HTMLElement) => el.click());
      await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '21-round-start-390');
    } finally {
      await ctx.close();
    }
  });
});
