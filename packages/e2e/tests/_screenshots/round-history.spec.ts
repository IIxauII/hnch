/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — populated round history.
 *
 * Scenes:
 *   hist-01  — lobby with 2 completed rounds in history list + current round results
 *   hist-02  — lobby after one participant left; their name still resolves in older
 *              round results (departed names preserved in raw participants map)
 *
 * Setup: host + 2 voters. Run 2 rounds. Then one voter leaves. History still shows
 * the departed voter's name in Round 1 results.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/round-history.spec.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  ROUND_HISTORY,
  fillRoomCode,
} from '../fixtures/helpers';

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

async function startRound(page: Page, title: string): Promise<void> {
  const startBtn = page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: LOBBY.startRoundBtn });
  await startBtn.evaluate((el: HTMLElement) => el.click());
  await page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
  await page.locator('app-round-start-sheet ion-input').first().locator('input').fill(title);
  await page.locator(ROUND_START.startBtn).evaluate((el: HTMLElement) => el.click());
  await page.waitForURL(/\/estimating/);
  await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
}

async function castAndWaitLobby(pages: Page[], votes: string[], hostPage: Page): Promise<void> {
  for (let i = 0; i < pages.length; i++) {
    await pages[i]!.locator(ESTIMATING.card(votes[i]!)).first().click();
  }
  await hostPage.waitForURL(/\/lobby/, { timeout: 15_000 });
  await hostPage.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
  await hostPage.waitForTimeout(500);
}

test.describe('round history screenshots', () => {
  test('populated history + departed name resolves', async ({ browser }) => {
    test.setTimeout(180_000);
    const viewport = { width: 1440, height: 900 };
    const contexts: BrowserContext[] = [];

    try {
      const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, viewport);
      contexts.push(hostCtx);

      const { ctx: aliceCtx, page: alicePage } = await freshCtx(browser, viewport);
      contexts.push(aliceCtx);

      const { ctx: bobCtx, page: bobPage } = await freshCtx(browser, viewport);
      contexts.push(bobCtx);

      await onboard(hostPage, 'Host');
      await onboard(alicePage, 'Alice');
      await onboard(bobPage, 'Bob');

      // Host creates session; Alice + Bob join
      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      await alicePage.goto(`${BASE_URL}/join`);
      await fillRoomCode(alicePage, code);
      await alicePage.locator('ion-button:has-text("Join")').first().click();
      await alicePage.waitForURL(/\/lobby/);

      await bobPage.goto(`${BASE_URL}/join`);
      await fillRoomCode(bobPage, code);
      await bobPage.locator('ion-button:has-text("Join")').first().click();
      await bobPage.waitForURL(/\/lobby/);

      await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });

      // Round 1
      await startRound(hostPage, 'Round 1 feature');
      await alicePage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await bobPage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await castAndWaitLobby([hostPage, alicePage, bobPage], ['3', '5', '5'], hostPage);

      // Round 2 (host is "Next Round")
      const nextBtn = hostPage.locator('ion-button').filter({ hasText: LOBBY.nextRoundBtn });
      await nextBtn.evaluate((el: HTMLElement) => el.click());
      await hostPage.locator('app-round-start-sheet').waitFor({ state: 'visible' });
      await hostPage
        .locator('app-round-start-sheet ion-input')
        .first()
        .locator('input')
        .fill('Round 2 story');
      await hostPage.locator(ROUND_START.startBtn).evaluate((el: HTMLElement) => el.click());
      await hostPage.waitForURL(/\/estimating/);
      await hostPage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await alicePage.waitForURL(/\/estimating/, { timeout: 10_000 });
      await bobPage.waitForURL(/\/estimating/, { timeout: 10_000 });
      await castAndWaitLobby([hostPage, alicePage, bobPage], ['8', '8', '13'], hostPage);

      // hist-01 — lobby with 2 revealed rounds; Round 1 in history, Round 2 in results
      // Round history section renders when >0 historical entries exist.
      await hostPage
        .locator(ROUND_HISTORY.section)
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {
          // Section may not appear yet; capture current state anyway
        });
      await shot(hostPage, 'hist-01-populated-history');

      // Bob leaves — his name should still resolve in history
      const bobMenuBtn = bobPage.locator('ion-header').locator('ion-button').last();
      await bobMenuBtn.click();
      const leaveSheet = bobPage.locator('ion-action-sheet button:has-text("Leave session")');
      const leavePopover = bobPage
        .locator('ion-popover')
        .getByRole('button', { name: 'Leave session' });
      await Promise.any([
        leaveSheet.waitFor({ state: 'visible', timeout: 5_000 }),
        leavePopover.waitFor({ state: 'visible', timeout: 5_000 }),
      ]);
      const isActionSheet = await leaveSheet.isVisible().catch(() => false);
      if (isActionSheet) {
        await leaveSheet.evaluate((el: HTMLElement) => el.click());
      } else {
        await leavePopover.evaluate((el: HTMLElement) => el.click());
      }
      const alert = bobPage.locator('ion-alert');
      await alert.waitFor({ state: 'visible', timeout: 5_000 });
      await bobPage.locator('ion-alert button:has-text("Leave")').click();
      await bobPage.waitForURL(/\/home/, { timeout: 5_000 });

      // Wait for host to see count drop
      await hostPage.waitForTimeout(1_000);

      // hist-02 — history still shows "Bob" in Round 1 chips (departed name resolves)
      await shot(hostPage, 'hist-02-departed-name-in-history');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });
});
