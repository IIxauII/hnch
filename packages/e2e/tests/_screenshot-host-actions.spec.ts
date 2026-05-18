/**
 * One-off screenshot helper for PR #255 — Lobby host actions popover/swipe.
 *
 * Skipped unless SCREENSHOTS=1 is set so CI never runs this.
 *
 * Run:
 *   SCREENSHOTS=1 pnpm --filter @hnch/e2e exec playwright test _screenshot-host-actions --project=chromium
 */

import { test, expect, devices } from '@playwright/test';
import { Participant } from './fixtures/app.fixture';

const SCREENSHOT_DIR =
  '/Users/xau/Documents/projects/hnch-lobby-host-actions-portal/docs/screenshots/lobby-host-actions-portal';

// Skip entire suite unless SCREENSHOTS env var is set.
test.describe.configure({ mode: 'serial' });

test.describe('Screenshots: lobby host actions', () => {
  test.skip(!process.env['SCREENSHOTS'], 'Set SCREENSHOTS=1 to run');

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  async function clearStorageScript(
    context: import('@playwright/test').BrowserContext,
  ): Promise<void> {
    await context.addInitScript(() => {
      try {
        void localStorage.length;
      } catch {
        return;
      }
      const KEEP = new Set([
        'CapacitorStorage.hnch.displayName',
        'CapacitorStorage.hnch.participantId',
        '_capuid',
      ]);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && !KEEP.has(key)) localStorage.removeItem(key);
      }
    });
  }

  async function setTheme(
    context: import('@playwright/test').BrowserContext,
    theme: 'light' | 'dark',
  ): Promise<void> {
    await context.addInitScript((t: string) => {
      try {
        localStorage.setItem('CapacitorStorage.hnch.theme', t);
      } catch {
        // ignore sandboxed frames
      }
    }, theme);
  }

  async function ensureAccordionOpen(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => {
      const group = document.querySelector('ion-accordion-group') as
        | (HTMLElement & { value?: string | null })
        | null;
      if (group) group.value = 'open';
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Desktop popover — light
  // ---------------------------------------------------------------------------

  test('desktop popover light', async ({ browser }) => {
    const hostCtx = await browser.newContext({ ...devices['Desktop Chrome'] });
    await clearStorageScript(hostCtx);
    await setTheme(hostCtx, 'light');
    const hostPage = await hostCtx.newPage();
    const host = new Participant(hostCtx, hostPage, 'Host');

    const playerCtx = await browser.newContext({ ...devices['Desktop Chrome'] });
    await clearStorageScript(playerCtx);
    const playerPage = await playerCtx.newPage();
    const player = new Participant(playerCtx, playerPage, 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      await ensureAccordionOpen(hostPage);
      const overflowBtn = hostPage.getByRole('button', { name: 'Host actions for Player' });
      await overflowBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await overflowBtn.evaluate((el: HTMLElement) => el.click());

      const popover = hostPage.locator('ion-popover');
      await popover.waitFor({ state: 'visible', timeout: 5_000 });
      await expect(popover.locator('ion-item').first()).toBeVisible();
      await hostPage.waitForTimeout(500);

      await hostPage.screenshot({
        path: `${SCREENSHOT_DIR}/desktop-popover-light.png`,
        fullPage: false,
      });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Desktop popover — dark
  // ---------------------------------------------------------------------------

  test('desktop popover dark', async ({ browser }) => {
    const hostCtx = await browser.newContext({ ...devices['Desktop Chrome'] });
    await clearStorageScript(hostCtx);
    await setTheme(hostCtx, 'dark');
    const hostPage = await hostCtx.newPage();
    const host = new Participant(hostCtx, hostPage, 'Host');

    const playerCtx = await browser.newContext({ ...devices['Desktop Chrome'] });
    await clearStorageScript(playerCtx);
    const playerPage = await playerCtx.newPage();
    const player = new Participant(playerCtx, playerPage, 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      await ensureAccordionOpen(hostPage);
      const overflowBtn = hostPage.getByRole('button', { name: 'Host actions for Player' });
      await overflowBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await overflowBtn.evaluate((el: HTMLElement) => el.click());

      const popover = hostPage.locator('ion-popover');
      await popover.waitFor({ state: 'visible', timeout: 5_000 });
      await expect(popover.locator('ion-item').first()).toBeVisible();
      await hostPage.waitForTimeout(500);

      await hostPage.screenshot({
        path: `${SCREENSHOT_DIR}/desktop-popover-dark.png`,
        fullPage: false,
      });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Mobile closed-state — light (iPhone 13)
  //
  // Captures the accordion open with swipe-hint visible and both participant
  // rows shown. Demonstrates: (a) no overflow button on mobile, (b) swipe-hint
  // text present. Mid-swipe screenshots are unreliable in emulation because
  // IonItemSliding.open() slides the row content fully off-frame rather than
  // partially revealing the options as a real touch gesture would.
  // ---------------------------------------------------------------------------

  test('mobile swipe light', async ({ browser }) => {
    const hostCtx = await browser.newContext({ ...devices['iPhone 13'] });
    await clearStorageScript(hostCtx);
    await setTheme(hostCtx, 'light');
    const hostPage = await hostCtx.newPage();
    const host = new Participant(hostCtx, hostPage, 'Host');

    const playerCtx = await browser.newContext({ ...devices['iPhone 13'] });
    await clearStorageScript(playerCtx);
    const playerPage = await playerCtx.newPage();
    const player = new Participant(playerCtx, playerPage, 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      // Open accordion so swipe-hint and both participant rows are visible.
      await ensureAccordionOpen(hostPage);
      // Wait for Player row to appear.
      await hostPage
        .locator('ion-list.participants ion-item-sliding')
        .filter({ hasText: 'Player' })
        .waitFor({ state: 'visible', timeout: 5_000 });
      // Confirm swipe-hint is present (success criterion: mobile shows hint, no overflow btn).
      await expect(hostPage.getByText('Swipe a row for host actions')).toBeVisible();
      await hostPage.waitForTimeout(300);

      await hostPage.screenshot({
        path: `${SCREENSHOT_DIR}/mobile-swipe-light.png`,
        fullPage: false,
      });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Mobile closed-state — dark (iPhone 13)
  //
  // Same approach as test 3 — closed accordion with swipe-hint visible.
  // ---------------------------------------------------------------------------

  test('mobile swipe dark', async ({ browser }) => {
    const hostCtx = await browser.newContext({ ...devices['iPhone 13'] });
    await clearStorageScript(hostCtx);
    await setTheme(hostCtx, 'dark');
    const hostPage = await hostCtx.newPage();
    const host = new Participant(hostCtx, hostPage, 'Host');

    const playerCtx = await browser.newContext({ ...devices['iPhone 13'] });
    await clearStorageScript(playerCtx);
    const playerPage = await playerCtx.newPage();
    const player = new Participant(playerCtx, playerPage, 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      // Open accordion so swipe-hint and both participant rows are visible.
      await ensureAccordionOpen(hostPage);
      // Wait for Player row to appear.
      await hostPage
        .locator('ion-list.participants ion-item-sliding')
        .filter({ hasText: 'Player' })
        .waitFor({ state: 'visible', timeout: 5_000 });
      // Confirm swipe-hint is present (success criterion: mobile shows hint, no overflow btn).
      await expect(hostPage.getByText('Swipe a row for host actions')).toBeVisible();
      await hostPage.waitForTimeout(300);

      await hostPage.screenshot({
        path: `${SCREENSHOT_DIR}/mobile-swipe-dark.png`,
        fullPage: false,
      });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});
