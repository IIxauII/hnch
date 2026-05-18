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

  async function openSwipeDrawer(
    page: import('@playwright/test').Page,
    participantName: string,
  ): Promise<void> {
    await ensureAccordionOpen(page);
    const rowLocator = page.locator(
      `ion-list.participants ion-item-sliding:has(ion-label:text-is("${participantName}"))`,
    );
    await rowLocator.waitFor({ state: 'visible', timeout: 5_000 });
    // Open the sliding drawer via the Playwright-matched element reference.
    // Uses native IonItemSliding.open() — no manual style.transform override.
    await rowLocator.evaluate(async (el: Element) => {
      await (el as unknown as { open(side: string): Promise<void> }).open('end');
    });
    // Allow the native slide animation to complete before capturing.
    await page.waitForTimeout(600);
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
  // 3. Mobile swipe — light (iPhone 13)
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

      await openSwipeDrawer(hostPage, 'Player');

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
  // 4. Mobile swipe — dark (iPhone 13)
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

      await openSwipeDrawer(hostPage, 'Player');

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
