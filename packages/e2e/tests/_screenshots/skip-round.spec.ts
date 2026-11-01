/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — skip round flow.
 *
 * Scenes:
 *   skip-01  — estimating page with overflow menu open showing "Skip round" option
 *   skip-01b — the confirmation that follows
 *   skip-02  — lobby after skip (round-skipped label, no Re-vote, no results)
 *
 * Host + 2 players so auto-reveal doesn't fire on a single vote.
 * Host votes then opens the menu — pre-skip votes are cast but suppressed in UI
 * after skip (ADR-0040).
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/skip-round.spec.ts
 */
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { test } from './_helpers/capture-test';
import { resolveOutDir } from './_helpers/out-dir';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ESTIMATING,
  fillRoomCode,
  expandRoundStartSheet,
  clickRoundStartSubmit,
} from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('skip');
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

test.describe('skip round screenshots', () => {
  test('skip action menu open + lobby skipped state @skip @host', async ({ browser }) => {
    test.setTimeout(120_000);
    const viewport = { width: 1440, height: 900 };
    const contexts: BrowserContext[] = [];

    try {
      const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, viewport);
      contexts.push(hostCtx);
      await onboard(hostPage, 'Host');

      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      // Two joiners so auto-reveal won't fire on host-only vote
      for (const name of ['Alice', 'Bob']) {
        const { ctx, page } = await freshCtx(browser, viewport);
        contexts.push(ctx);
        await onboard(page, name);
        await page.goto(`${BASE_URL}/join`);
        await fillRoomCode(page, code);
        // The sixth character submits: no Join tap after a typed code.
        await page.waitForURL(/\/lobby/);
      }

      await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });

      // Start round
      const startBtn = hostPage
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startBtn.click();
      await expandRoundStartSheet(hostPage);
      await hostPage
        .locator('app-round-start-sheet ion-input')
        .first()
        .locator('input')
        .fill('Ticket to skip');
      await hostPage.locator('app-round-start-sheet ion-input').first().locator('input').blur();
      await clickRoundStartSubmit(hostPage);
      await hostPage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });

      // Host votes (pre-skip vote, suppressed in UI after skip)
      await hostPage.locator(ESTIMATING.card('5')).first().click();
      await hostPage.waitForTimeout(300);

      // Open overflow menu
      const menuBtn = hostPage.locator('ion-header').locator('ion-button').last();
      await menuBtn.click();

      // Wait for overlay (action-sheet or popover)
      await Promise.any([
        hostPage.locator('ion-action-sheet').waitFor({ state: 'visible', timeout: 5_000 }),
        hostPage.locator('ion-popover').waitFor({ state: 'visible', timeout: 5_000 }),
      ]);
      await hostPage.waitForTimeout(300);

      // skip-01 — menu open with "Skip round" visible
      await shot(hostPage, 'skip-01-menu-open-skip-option');

      // Click "Skip round"
      const actionSheetBtn = hostPage.locator('ion-action-sheet button:has-text("Skip round")');
      const popoverBtn = hostPage
        .locator('ion-popover')
        .getByRole('button', { name: 'Skip round' });
      const isActionSheet = await actionSheetBtn.isVisible().catch(() => false);
      if (isActionSheet) {
        await actionSheetBtn.evaluate((el: HTMLElement) => el.click());
      } else {
        await popoverBtn.evaluate((el: HTMLElement) => el.click());
      }

      // skip-01b — the question before the round is dropped
      const alert = hostPage.locator('ion-alert');
      await alert.waitFor({ state: 'visible', timeout: 5_000 });
      await hostPage.waitForTimeout(400);
      await shot(hostPage, 'skip-01b-confirm');
      await alert.getByRole('button', { name: 'Skip round' }).click();

      await hostPage.waitForURL(/\/lobby/, { timeout: 10_000 });
      const skippedLabel = hostPage.locator('p.round-skipped');
      await skippedLabel.waitFor({ state: 'visible', timeout: 8_000 });
      await hostPage.waitForTimeout(400);

      // skip-02 — lobby with skipped round label
      await shot(hostPage, 'skip-02-lobby-skipped-state');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });
});
