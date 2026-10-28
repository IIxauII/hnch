import { clickMenuOption, test, expect } from './fixtures/app.fixture';
import { HOME, LOBBY, rememberedSessionCodes } from './fixtures/helpers';

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
    // Create a session, which the device remembers once it is in it
    const code = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await expect.poll(() => rememberedSessionCodes(host.page)).toContain(code);

    // Leave the session
    await host.leaveSession();

    // Verify we are on home
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).waitFor({ state: 'visible' });

    // Forgotten: nothing to jump back into...
    await expect.poll(() => rememberedSessionCodes(host.page)).toEqual([]);

    // ...and a Home that has read that shows no rows, and no "Jump back in"
    // heading over an empty list either. The list is read after the page is
    // up: looked at straight away, it is empty whatever is remembered.
    await host.page.reload();
    await host.page.locator(HOME.createCard).waitFor({ state: 'visible' });
    expect(await rememberedSessionCodes(host.page)).toEqual([]);
    await host.page.waitForTimeout(500);
    await expect(host.page.locator(HOME.recentRow)).toHaveCount(0);
    await expect(host.page.locator('app-home')).not.toContainText('Jump back in');
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
