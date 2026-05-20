/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture for issue #154 (PWA keyboard shortcuts).
 *
 * Produces PNGs under .claude/screens/kbd-<sha>/:
 *   - estimating-empty.png       Estimating screen, no vote
 *   - estimating-keyboard-cast.png   After pressing Digit1
 *   - estimating-arrow-focus.png Focus moved via ArrowRight
 *   - settings-keyboard-shortcuts.png Settings info section
 *
 * Run with:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/keyboard-shortcuts.spec.ts
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { test, type Browser, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  fillRoomCode,
} from '../fixtures/helpers';

const SHA =
  process.env['SCREENSHOT_SHA'] ??
  execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

const OUT_DIR = path.resolve(__dirname, '../../../../.claude/screens', `kbd-${SHA}`);

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function shot(page: Page, name: string): Promise<void> {
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
  await page.locator(JOIN.joinBtn).click();
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
  await page.locator(ROUND_START.titleInput).locator('input').first().fill('Implement OAuth flow');
  await page.locator(ROUND_START.startBtn).click();
  await page.waitForURL(/\/estimating/);
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
  await page.locator('ion-list-header:has-text("Keyboard shortcuts")').waitFor({ timeout: 5_000 });
  await page.locator('ion-list-header:has-text("Keyboard shortcuts")').scrollIntoViewIfNeeded();
  await shot(page, '05-settings-keyboard-shortcuts');

  await ctx.close();
});
