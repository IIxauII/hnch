import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

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

test.describe('Leave session flow', () => {
  test('host leaves session via action sheet → confirm → navigates to Home', async ({ host }) => {
    // Create a session
    const code = await host.createSession();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Verify we are in the lobby
    await host.page.waitForURL(/\/lobby/);
    await host.expectParticipantCount(1);

    // Leave the session
    await host.leaveSession();

    // Verify we are on the home page
    expect(host.page.url()).toContain('/home');
  });

  test('after explicit leave, last session cache is cleared', async ({ host }) => {
    // Create a session
    await host.createSession();
    await host.page.waitForURL(/\/lobby/);

    // Leave the session
    await host.leaveSession();

    // Verify we are on home
    await host.page.waitForURL(/\/home/);

    // The "Jump back in" banner should NOT appear (last session was explicitly cleared)
    // Wait a moment for any potential banner to render
    await host.page.waitForTimeout(500);

    // Check that there's no jump-back-in banner/card
    // (The banner typically shows the room code from the last session)
    const jumpBackBanner = host.page.locator('ion-card:has-text("Jump back in")');
    const isVisible = await jumpBackBanner.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test('cancel on leave alert dismisses dialog without leaving', async ({ host }) => {
    // Create a session
    await host.createSession();
    await host.page.waitForURL(/\/lobby/);

    // Open menu (action-sheet on mobile, popover on desktop)
    const actionBtn = host.page.locator('ion-header').locator('ion-button').last();
    await actionBtn.click();

    // Tap "Leave session" — surface-agnostic
    await clickMenuOption(host.page, 'Leave session');

    // Alert appears
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });

    // Cancel the alert
    const cancelBtn = host.page.locator('ion-alert button:has-text("Cancel")');
    await cancelBtn.click();

    // Alert should dismiss
    await alert.waitFor({ state: 'hidden', timeout: 5_000 });

    // Should still be on /lobby
    await host.page.waitForURL(/\/lobby/);
    expect(host.page.url()).toContain('/lobby');

    // Room code should still be visible
    const roomCode = host.page.locator(LOBBY.roomCode);
    await expect(roomCode).toBeVisible();
  });
});
