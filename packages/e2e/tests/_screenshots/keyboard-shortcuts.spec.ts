/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture for #154 (PWA keyboard shortcuts).
 *
 * Produces PNGs under docs/screenshots/<sha>/kbd/:
 *   - estimating-empty.png       Estimating screen, no vote
 *   - estimating-keyboard-cast.png   After pressing Digit1
 *   - estimating-arrow-focus.png Focus moved via ArrowRight
 *   - settings-keyboard-shortcuts.png Settings info section
 *
 * Run with:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/keyboard-shortcuts.spec.ts
 */
import path from 'node:path';
import { test, type Browser, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  fillRoomCode,
  expandRoundStartSheet,
  clickRoundStartSubmit,
} from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('keyboard');
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function shot(page: Page, name: string): Promise<void> {
  await pageSettled(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function joinAs(browser: Browser, name: string, code: string): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/`);
  await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
  await page.locator(HOME.joinCard).click();
  await page.waitForURL(/\/join/);
  await fillRoomCode(page, code);
  // The sixth character submits: no Join tap after a typed code.
  await page.waitForURL(/\/lobby/);
  return page;
}

test('capture keyboard-shortcuts screenshots @layout @onboarding', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  // Onboarding -> Home -> Create session.
  await page.goto(`${BASE_URL}/`);
  await page.locator(ONBOARDING.nameInput).locator('input').fill('Alex');
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);

  // Pull the room code from the URL so a peer can join.
  const code = page.url().match(/lobby\/([A-Z0-9]{6})/i)?.[1] ?? '';
  // Bring a peer in so unanimous auto-reveal does not fire on the first vote.
  const peer = await joinAs(browser, 'Sam', code);

  // Start a round.
  await page.getByRole('button', { name: LOBBY.startRoundBtn }).click();
  await expandRoundStartSheet(page);
  await page.locator(ROUND_START.titleInput).locator('input').first().fill('Implement OAuth flow');
  await page.locator(ROUND_START.titleInput).locator('input').first().blur();
  await clickRoundStartSubmit(page);
  await page.locator('app-estimating:not(.ion-page-invisible):not(.ion-page-hidden)').waitFor();
  await peer.waitForURL(/\/estimating/);

  // 1. Estimating screen, no vote yet.
  await shot(page, '01-estimating-empty');

  // 2. After pressing Digit1 — first card highlighted.
  await page.locator(ESTIMATING.card('0')).waitFor({ timeout: 5_000 });
  await page.locator(ESTIMATING.card('0')).first().focus();
  await page.keyboard.press('Digit1');
  await page.locator(ESTIMATING.card('0') + '.selected').waitFor({ timeout: 5_000 });
  await shot(page, '02-estimating-digit1-cast');

  // 3. Press Digit1 again — vote cleared, then arrow-nav to index 3.
  await page.keyboard.press('Digit1');
  await page.locator(ESTIMATING.card('0')).first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await shot(page, '03-estimating-arrow-focused');

  // 4. Press Digit4 to cast '3' (Fibonacci index 3).
  await page.keyboard.press('Digit4');
  await page.locator(ESTIMATING.card('3') + '.selected').waitFor({ timeout: 5_000 });
  await shot(page, '04-estimating-digit4-cast');

  // 5. Settings — keyboard shortcuts info section.
  await page.goto(`${BASE_URL}/settings`);
  const shortcuts = page.locator('app-settings .section-label:has-text("Keyboard shortcuts")');
  await shortcuts.waitFor({ timeout: 5_000 });
  await shortcuts.scrollIntoViewIfNeeded();
  await shot(page, '05-settings-keyboard-shortcuts');

  await ctx.close();
});
