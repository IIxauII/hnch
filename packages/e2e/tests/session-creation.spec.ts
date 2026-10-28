import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, LOBBY, expectToast } from './fixtures/helpers';

test.describe('Session creation', () => {
  test('host creates a session and sees the lobby', async ({ host }) => {
    const code = await host.createSession();

    // Room code is 6 alphanumeric characters
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Room code displayed on page (formatted with dash)
    const displayedCode = await host.page.locator(LOBBY.roomCode).textContent();
    expect(displayedCode?.replaceAll(/[^A-Z0-9]/gi, '')).toBe(code);

    // Participant count is 1
    await host.expectParticipantCount(1);

    // Host sees "Start round 1" button
    await expect(host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })).toBeVisible();

    // The toolbar is titled with the screen's name until the session has one
    await expect(host.page.locator('app-lobby:not(.ion-page-hidden) ion-title')).toHaveText(
      'Lobby',
    );
  });

  test('relay out of reach: says so and stays on Home, nothing half-created', async ({ host }) => {
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/(home|onboarding)/);
    if (host.page.url().includes('/onboarding')) await host.onboard();

    await host.page.context().setOffline(true);
    try {
      await host.page.locator(HOME.createCard).click();
      await expectToast(host.page, "Couldn't reach the relay", { timeout: 10_000 });
    } finally {
      await host.page.context().setOffline(false);
    }

    expect(host.page.url()).toContain('/home');
    await expect(host.page.locator(HOME.recentRow)).toHaveCount(0);

    // ...and the row works again once the relay is back
    await host.page.locator(HOME.createCard).click();
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
  });

  test('a session name becomes the lobby title', async ({ host }) => {
    await host.createSession();
    await host.openSettings();
    const nameInput = host.page
      .locator('app-session-settings-sheet ion-input[label="Session name"]')
      .locator('input');
    await nameInput.fill('Sprint 24 planning');
    await nameInput.press('Enter');
    await host.closeSettings();

    await expect(host.page.locator('app-lobby:not(.ion-page-hidden) ion-title')).toHaveText(
      'Sprint 24 planning',
    );
  });
});
