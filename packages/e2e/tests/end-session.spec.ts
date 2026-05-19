import { test, expect } from './fixtures/app.fixture';
import { LOBBY, expectToast } from './fixtures/helpers';

/**
 * Click a named item in the header ⋯ menu overlay.
 * Works for both ion-action-sheet (mobile) and ion-popover/app-menu-popover (desktop).
 */
async function clickMenuOption(page: import('@playwright/test').Page, text: string): Promise<void> {
  const actionSheetBtn = page.locator(`ion-action-sheet button:has-text("${text}")`);
  // ion-item[button] renders a native <button> in shadow DOM; getByRole() pierces shadow.
  const popoverBtn = page.locator('ion-popover').getByRole('button', { name: text });

  await Promise.any([
    actionSheetBtn.waitFor({ state: 'visible', timeout: 5_000 }),
    popoverBtn.waitFor({ state: 'visible', timeout: 5_000 }),
  ]);

  const isActionSheet = await actionSheetBtn.isVisible().catch(() => false);
  if (isActionSheet) {
    await actionSheetBtn.click();
  } else {
    await popoverBtn.click();
  }
}

/**
 * Dismiss the open menu without selecting any item.
 * Action-sheet: clicks "Cancel". Popover: presses Escape.
 */
async function dismissMenu(page: import('@playwright/test').Page): Promise<void> {
  const actionSheet = page.locator('ion-action-sheet');
  const popover = page.locator('ion-popover');

  await Promise.any([
    actionSheet.waitFor({ state: 'visible', timeout: 5_000 }),
    popover.waitFor({ state: 'visible', timeout: 5_000 }),
  ]);

  const isActionSheet = await actionSheet.isVisible().catch(() => false);
  if (isActionSheet) {
    const cancelBtn = page.locator('ion-action-sheet button:has-text("Cancel")');
    await cancelBtn.click();
    await actionSheet.waitFor({ state: 'hidden', timeout: 5_000 });
  } else {
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

/**
 * Helper: open ⋯ menu and trigger "End session for everyone" flow.
 * Works on both mobile (action-sheet) and desktop (popover) viewports.
 */
async function endSessionForEveryone(page: import('@playwright/test').Page): Promise<void> {
  const actionBtn = page.locator('ion-header').locator('ion-button').last();
  await actionBtn.click();

  await clickMenuOption(page, 'End session for everyone');

  const alert = page.locator('ion-alert');
  await alert.waitFor({ state: 'visible', timeout: 5_000 });

  const confirmBtn = page.locator('ion-alert button:has-text("End session")');
  await confirmBtn.click();
}

test.describe('End session for everyone', () => {
  test('host ends session → host navigates to Home', async ({ host }) => {
    await host.createSession();
    await host.page.waitForURL(/\/lobby/);

    await endSessionForEveryone(host.page);

    await host.page.waitForURL(/\/home/, { timeout: 10_000 });
    expect(host.page.url()).toContain('/home');
  });

  test('host ends session → joiner navigates to Home', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);

    await endSessionForEveryone(host.page);

    // Both clients land on /home
    await host.page.waitForURL(/\/home/, { timeout: 10_000 });
    await player.page.waitForURL(/\/home/, { timeout: 10_000 });

    expect(host.page.url()).toContain('/home');
    expect(player.page.url()).toContain('/home');
  });

  test('host ends session — joiner sees "Session ended" toast', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);

    await endSessionForEveryone(host.page);

    // Wait for joiner to land on home
    await player.page.waitForURL(/\/home/, { timeout: 10_000 });

    // Toast with "Session ended" text should appear on the joiner's page
    await expectToast(player.page, /session ended/i);
  });

  test('host ends session during active round — joiner navigates to Home', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();

    await host.castVote('5');
    await player.castVote('8');

    // End session while on estimating page
    await endSessionForEveryone(host.page);

    await host.page.waitForURL(/\/home/, { timeout: 10_000 });
    await player.page.waitForURL(/\/home/, { timeout: 10_000 });

    expect(host.page.url()).toContain('/home');
    expect(player.page.url()).toContain('/home');
  });

  test('"End session for everyone" is NOT visible to joiner (non-host)', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);

    // Open menu on joiner
    const actionBtn = player.page.locator('ion-header').locator('ion-button').last();
    await actionBtn.click();

    // Wait for whichever overlay appears
    const actionSheet = player.page.locator('ion-action-sheet');
    const popover = player.page.locator('ion-popover app-menu-popover');
    await Promise.any([
      actionSheet.waitFor({ state: 'visible', timeout: 5_000 }),
      popover.waitFor({ state: 'visible', timeout: 5_000 }),
    ]);

    // "End session for everyone" must not appear in either overlay
    const endActionSheetBtn = player.page.locator(
      'ion-action-sheet button:has-text("End session for everyone")',
    );
    // Popover: ion-item[button] native button in shadow DOM, found via getByRole
    const endPopoverBtn = player.page
      .locator('ion-popover')
      .getByRole('button', { name: 'End session for everyone' });
    await expect(endActionSheetBtn).not.toBeVisible();
    await expect(endPopoverBtn).not.toBeVisible();

    // Dismiss
    await dismissMenu(player.page);
  });

  test('cancel on confirmation alert keeps session alive', async ({ host }) => {
    await host.createSession();
    await host.page.waitForURL(/\/lobby/);

    const actionBtn = host.page.locator('ion-header').locator('ion-button').last();
    await actionBtn.click();

    await clickMenuOption(host.page, 'End session for everyone');

    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });

    const cancelBtn = host.page.locator('ion-alert button:has-text("Cancel")');
    await cancelBtn.click();

    await alert.waitFor({ state: 'hidden', timeout: 5_000 });

    // Still on /lobby
    await host.page.waitForURL(/\/lobby/);
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
  });
});
