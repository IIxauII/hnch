import { test, expect } from './fixtures/app.fixture';
import { LOBBY, SESSION_TOOLBAR, expectToast } from './fixtures/helpers';

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

  test('a joiner (non-host) has no menu to end the session from — only Leave', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);
    await player.expectParticipantCount(2);

    const joinerLobby = player.page.locator('app-lobby:not(.ion-page-hidden)');

    // The host's ⋯ menu is where "End session for everyone" lives. The joiner
    // has no such menu...
    await expect(
      host.page
        .locator('app-lobby:not(.ion-page-hidden)')
        .getByRole('button', { name: SESSION_TOOLBAR.menuBtn }),
    ).toBeVisible();
    await expect(joinerLobby.getByRole('button', { name: SESSION_TOOLBAR.menuBtn })).toHaveCount(0);

    // ...their one action is a button, and it opens the Leave confirmation
    // directly rather than a one-item menu.
    await joinerLobby.getByRole('button', { name: SESSION_TOOLBAR.leaveBtn }).click();
    const alert = player.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(alert).toContainText('Leave session?');
    await expect(player.page.locator('ion-action-sheet')).toHaveCount(0);
    await expect(player.page.locator('ion-popover')).toHaveCount(0);

    // Cancel keeps the joiner in the session
    await alert.locator('button:has-text("Cancel")').click();
    await alert.waitFor({ state: 'hidden', timeout: 5_000 });
    await expect(player.page).toHaveURL(/\/lobby/);
    await host.expectParticipantCount(2);
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
