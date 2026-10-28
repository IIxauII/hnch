/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — participant management scenes.
 *
 * Scenes:
 *   part-01  — role switch ("Observer") on estimating page
 *   part-02  — host's roster and the ⋯ menu on a participant's row
 *              (action sheet on mobile, popover on desktop)
 *   part-03  — leave-session confirm alert
 *
 * part-02 runs at 390 with touch and at 1440 with a pointer. Desktop 1440
 * for part-01 and part-03.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/participants.spec.ts
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';
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
  SESSION_TOOLBAR,
  KICK_AFFORDANCE,
} from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('participants');
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
  await pageSettled(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `participants-${name}.png`), fullPage: false });
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
      // The sixth character submits: no Join tap after a typed code.
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
        .filter({ hasText: /Voter|Observer/ })
        .first();
      await chip.waitFor({ state: 'visible' });
      await chip.evaluate((el: HTMLElement) => el.click());
      await playerPage
        .locator(ESTIMATING.roleChip)
        .filter({ hasText: 'Observer' })
        .first()
        .waitFor({ state: 'visible' });
      await playerPage.waitForTimeout(300);

      // part-01 — viewer role chip
      await shot(playerPage, 'part-01-viewer-role-chip');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });

  for (const [surface, viewport, overlay] of [
    ['mobile', { width: 390, height: 844 }, 'ion-action-sheet'],
    ['desktop', { width: 1440, height: 900 }, 'ion-popover'],
  ] as const) {
    test(`host actions menu on a participant row (${surface}) @participants @host`, async ({
      browser,
    }) => {
      test.setTimeout(90_000);
      const contexts: BrowserContext[] = [];

      try {
        // `hasTouch` makes the pointer coarse, which is what — with the width —
        // decides between an action sheet and a popover.
        const hostCtx = await browser.newContext({
          viewport,
          deviceScaleFactor: 2,
          colorScheme: 'dark',
          hasTouch: surface === 'mobile',
          isMobile: surface === 'mobile',
        });
        contexts.push(hostCtx);
        const hostPage = await hostCtx.newPage();
        const { ctx: playerCtx, page: playerPage } = await freshCtx(browser, viewport);
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
        // The sixth character submits: no Join tap after a typed code.
        await playerPage.waitForURL(/\/lobby/);
        await hostPage.locator(KICK_AFFORDANCE.row('Alice')).waitFor({ state: 'visible' });

        // part-02 — the roster: a ⋯ button on Alice's row, none on the host's own
        await shot(hostPage, `part-02-roster-host-${surface}`);

        await hostPage.locator(KICK_AFFORDANCE.menuBtn('Alice')).click();
        await hostPage.locator(overlay).waitFor({ state: 'visible', timeout: 5_000 });
        await hostPage.waitForTimeout(400);

        // part-02b — Make host / Remove
        await shot(hostPage, `part-02b-host-actions-menu-${surface}`);
      } finally {
        for (const ctx of contexts) await ctx.close();
      }
    });
  }

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
      // The sixth character submits: no Join tap after a typed code.
      await playerPage.waitForURL(/\/lobby/);

      // Player taps Leave — a button in the toolbar for everyone but the host
      await playerPage
        .locator('app-lobby:not(.ion-page-hidden)')
        .getByRole('button', { name: SESSION_TOOLBAR.leaveBtn })
        .click();

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
