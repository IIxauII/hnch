/**
 * Spec — Mobile swipe path for host-actions (iPhone 13 viewport)
 *
 * The overflow ellipsis button is gated on `surface.mode() === 'desktop'`
 * (`(min-width: 768px) and (pointer: fine)`). iPhone 13 is 390 px wide with
 * `pointer: coarse`, so the button must NOT render. Instead the swipe-hint
 * paragraph is visible and the IonItemSliding drawer provides Make Host and
 * Remove options.
 *
 * Ordering invariant (swipe drawer → alert):
 * `open('end')` on IonItemSliding synchronously opens the drawer. The option
 * tap calls onHandoffTap / onRemoveTap which create and present ion-alert.
 * The test awaits alert visibility before confirm — same C7 serialisation
 * as the desktop spec.
 *
 * Swipe: IonItemSliding has no first-class Playwright gesture API.
 * We call `element.open('end')` programmatically via evaluate(), identical
 * to the approach in participant-host-kick.spec.ts, to avoid pointer-drag
 * flakiness on headless Chromium.
 */

import { test, expect, devices } from '@playwright/test';
import { Participant } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

// Strip defaultBrowserType — Playwright otherwise tries to launch webkit even
// when the project is chromium, breaking CI runners that only install one browser.
const { defaultBrowserType: _iphoneDefaultBrowserType, ...IPHONE_13 } = devices['iPhone 13'];
test.use(IPHONE_13);

// ---------------------------------------------------------------------------
// Minimal two-context fixture (mirrors app.fixture.ts host+player pattern)
// ---------------------------------------------------------------------------

async function clearStorage(context: import('@playwright/test').BrowserContext): Promise<void> {
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

// ---------------------------------------------------------------------------
// Helper: open swipe drawer for a participant row (end side)
// Mirrors participant-host-kick.spec.ts openSwipeDrawer()
// ---------------------------------------------------------------------------

async function openSwipeDrawer(
  page: import('@playwright/test').Page,
  participantName: string,
): Promise<void> {
  // Force the accordion open so the rows are visible
  await page.evaluate(() => {
    const group = document.querySelector('ion-accordion-group') as
      | (HTMLElement & { value?: string | null })
      | null;
    if (group) group.value = 'open';
  });

  const rowLocator = page.locator(
    `ion-list.participants ion-item-sliding:has(ion-label:text-is("${participantName}"))`,
  );
  await rowLocator.waitFor({ state: 'visible', timeout: 5_000 });

  // Programmatically open the sliding drawer (no Playwright swipe-gesture API)
  await rowLocator.evaluate((el: Element) => {
    (el as unknown as { open(side: string): void }).open('end');
  });

  // Wait for at least one option to become visible
  const anyOption = page.locator(`ion-item-option[aria-label*="${participantName}"]`).first();
  await anyOption.waitFor({ state: 'visible', timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Mobile host-actions swipe path (iPhone 13)', () => {
  test('overflow button absent; swipe-hint visible; Remove via swipe', async ({ browser }) => {
    const hostCtx = await browser.newContext(IPHONE_13);
    await clearStorage(hostCtx);
    const hostPage = await hostCtx.newPage();
    const host = new Participant(hostCtx, hostPage, 'Host');

    const playerCtx = await browser.newContext(IPHONE_13);
    await clearStorage(playerCtx);
    const playerPage = await playerCtx.newPage();
    const player = new Participant(playerCtx, playerPage, 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      // Force accordion open so content renders
      await hostPage.evaluate(() => {
        const group = document.querySelector('ion-accordion-group') as
          | (HTMLElement & { value?: string | null })
          | null;
        if (group) group.value = 'open';
      });

      // Overflow button must NOT be present on mobile
      const overflowBtn = hostPage.getByRole('button', { name: /^Host actions for /u });
      await expect(overflowBtn).not.toBeVisible();

      // Swipe-hint paragraph IS visible (mobile + isHost())
      const swipeHint = hostPage.locator('p.swipe-hint');
      await expect(swipeHint).toBeVisible();

      // Open swipe drawer for Player row
      await openSwipeDrawer(hostPage, 'Player');

      // Remove option is present in the drawer
      const removeOption = hostPage.locator(
        'ion-item-option[aria-label="Remove Player from session"]',
      );
      await expect(removeOption).toBeVisible();

      // Tap Remove
      await removeOption.click();

      // Ordering invariant: wait for alert before confirm
      const alert = hostPage.locator('ion-alert');
      await alert.waitFor({ state: 'visible', timeout: 5_000 });
      const confirmBtn = hostPage.locator('ion-alert button:has-text("Remove")');
      await confirmBtn.click();

      await host.expectParticipantCount(1);
      await expect(hostPage.locator(LOBBY.participantList)).not.toContainText('Player');
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('Make Host via swipe: host badge transfers to other participant', async ({ browser }) => {
    const hostCtx = await browser.newContext(IPHONE_13);
    await clearStorage(hostCtx);
    const hostPage = await hostCtx.newPage();
    const host = new Participant(hostCtx, hostPage, 'Host');

    const playerCtx = await browser.newContext(IPHONE_13);
    await clearStorage(playerCtx);
    const playerPage = await playerCtx.newPage();
    const player = new Participant(playerCtx, playerPage, 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      await openSwipeDrawer(hostPage, 'Player');

      const makeHostOption = hostPage.locator('ion-item-option[aria-label="Make Player host"]');
      await makeHostOption.waitFor({ state: 'visible', timeout: 5_000 });
      await makeHostOption.click();

      // Ordering invariant (C7): alert present before confirm
      const alert = hostPage.locator('ion-alert');
      await alert.waitFor({ state: 'visible', timeout: 5_000 });
      const confirmBtn = hostPage.locator('ion-alert button:has-text("Confirm")');
      await confirmBtn.click();

      // Player now has the host icon in host's participant list
      const participantList = hostPage.locator(LOBBY.participantList);
      await expect(
        participantList.locator('ion-label').filter({ hasText: 'Player' }).locator('.host-icon'),
      ).toBeVisible({ timeout: 8_000 });
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });

  test('Sanity: swipe-hint hidden on desktop (Desktop Chrome)', async ({ browser }) => {
    // Use a desktop context to verify swipe-hint is absent — complementary sanity
    // to the desktop spec. Runs here to keep all surface-mode sanities together.
    const ctx = await browser.newContext({ ...devices['Desktop Chrome'] });
    await clearStorage(ctx);
    const page = await ctx.newPage();
    const host = new Participant(ctx, page, 'Host');

    try {
      const playerCtx = await browser.newContext({ ...devices['Desktop Chrome'] });
      await clearStorage(playerCtx);
      const playerPage = await playerCtx.newPage();
      const player = new Participant(playerCtx, playerPage, 'Player');

      try {
        const code = await host.createSession();
        await player.joinSession(code);
        await host.expectParticipantCount(2);

        // Force accordion open
        await page.evaluate(() => {
          const group = document.querySelector('ion-accordion-group') as
            | (HTMLElement & { value?: string | null })
            | null;
          if (group) group.value = 'open';
        });

        // swipe-hint NOT visible on desktop
        await expect(page.locator('p.swipe-hint')).not.toBeVisible();

        // Overflow button IS visible on desktop
        await expect(page.getByRole('button', { name: 'Host actions for Player' })).toBeVisible();
      } finally {
        await playerCtx.close();
      }
    } finally {
      await ctx.close();
    }
  });
});
