/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — participant management scenes.
 *
 * Scenes:
 *   part-01  — viewer role chip ("Observing") on estimating page
 *   part-02  — swipe-left kick affordance on mobile (Remove option exposed)
 *   part-03  — leave-session confirm alert
 *
 * Uses iPhone 13 viewport for part-02 (swipe affordance is mobile-only;
 * desktop uses popover host actions). Desktop 1440 for part-01 and part-03.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/participants.spec.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { test, type BrowserContext, type Page } from '@playwright/test';
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

const SHA = process.env['SCREENSHOT_SHA'] ?? 'local';
const OUT_DIR = path.resolve(__dirname, '../../../../docs/screenshots', SHA);

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function freshCtx(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark' = 'dark',
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
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
    await page.locator(ONBOARDING.continueBtn).click();
    await page.waitForURL(/\/home/);
  }
}

test.describe('participant management screenshots', () => {
  test('viewer role chip on estimating @participants @viewer', async ({ browser }) => {
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
        .fill('Story X');
      await hostPage.locator('app-round-start-sheet ion-input').first().locator('input').blur();
      await clickRoundStartSubmit(hostPage);
      await playerPage.waitForURL(/\/estimating/, { timeout: 10_000 });
      await playerPage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });

      // Player toggles to observer role
      const chip = playerPage
        .locator(ESTIMATING.roleChip)
        .filter({ hasText: /Voter|Observing/ })
        .first();
      await chip.waitFor({ state: 'visible' });
      await chip.evaluate((el: HTMLElement) => el.click());
      await playerPage
        .locator(ESTIMATING.roleChip)
        .filter({ hasText: 'Observing' })
        .first()
        .waitFor({ state: 'visible' });
      await playerPage.waitForTimeout(300);

      // part-01 — viewer role chip
      await shot(playerPage, 'part-01-viewer-role-chip');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });

  test('swipe-kick affordance (mobile) @participants @host', async ({ browser }) => {
    test.setTimeout(90_000);
    // iPhone 13 viewport: pointer:coarse → swipe drawer visible
    const mobileVp = { width: 390, height: 844 };
    const contexts: BrowserContext[] = [];

    try {
      const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, mobileVp);
      contexts.push(hostCtx);
      const { ctx: playerCtx, page: playerPage } = await freshCtx(browser, mobileVp);
      contexts.push(playerCtx);

      await onboard(hostPage, 'Host');
      await onboard(playerPage, 'Alice');

      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      await playerPage.goto(`${BASE_URL}/join`);
      await fillRoomCode(playerPage, code);
      await playerPage.locator('ion-button:has-text("Join")').first().click();
      await playerPage.waitForURL(/\/lobby/);
      await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await hostPage.waitForTimeout(500);

      // Open swipe drawer on Alice's row (programmatically — avoids pointer-drag flakiness)
      const sliding = hostPage.locator('ion-item-sliding').first();
      const slidingExists = await sliding.isVisible().catch(() => false);
      if (slidingExists) {
        await sliding.evaluate((el: Element) => {
          (el as unknown as { open: (side: string) => Promise<void> }).open('end');
        });
        await hostPage.waitForTimeout(400);
      }
      // TODO Phase 1 verification: confirm ion-item-sliding exists in lobby participant list
      // on mobile viewport and that ion-item-option:has-text("Remove") is visible after open().

      // part-02 — swipe drawer with Remove option
      await shot(hostPage, 'part-02-swipe-kick-affordance-mobile');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });

  test('leave-session confirm alert @participants', async ({ browser }) => {
    test.setTimeout(60_000);
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

      // Player opens menu → Leave session
      const menuBtn = playerPage.locator('ion-header').locator('ion-button').last();
      await menuBtn.click();
      const leaveSheet = playerPage.locator('ion-action-sheet button:has-text("Leave session")');
      const leavePopover = playerPage
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

      const alert = playerPage.locator('ion-alert');
      await alert.waitFor({ state: 'visible', timeout: 5_000 });
      await playerPage.waitForTimeout(300);

      // part-03 — leave-session confirm alert
      await shot(playerPage, 'part-03-leave-session-confirm');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });
});
