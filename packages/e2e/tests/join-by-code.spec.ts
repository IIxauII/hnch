import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, JOIN, LOBBY, fillRoomCode } from './fixtures/helpers';

test.describe('Join by code', () => {
  test('player joins a session using the room code', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Both see participant count = 2
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);

    // Player does NOT see the "Start round" button (host-only control)
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible();

    // ...and is told what they are waiting for instead
    await expect(player.page.locator(LOBBY.waitingNote)).toHaveText(
      'Waiting for Host to start the first round.',
    );

    // Host still sees "Start round", and is not told to wait for themselves
    await expect(host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })).toBeVisible();
    await expect(host.page.locator(LOBBY.waitingNote)).toHaveCount(0);
  });

  test('the sixth character joins: there is no Join tap after a typed code', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();

    await player.page.goto(`${BASE_URL}/home`);
    await player.page.waitForURL(/\/(home|onboarding)/);
    if (player.page.url().includes('/onboarding')) await player.onboard();
    await player.page.locator(HOME.joinCard).click();
    await player.page.waitForURL(/\/join/);

    // Five characters in: nothing happens, and Join has nothing to act on
    const firstTile = player.page.locator(JOIN.codeInput).locator('input').first();
    await firstTile.focus();
    await player.page.keyboard.type(code.slice(0, 5));
    // getByRole reaches the native button inside ion-button, which is what
    // carries `disabled`.
    const joinBtn = player.page
      .locator('app-join')
      .getByRole('button', { name: 'Join', exact: true });
    await expect(joinBtn).toBeDisabled();
    expect(player.page.url()).toContain('/join');

    // The sixth lands the player in the lobby
    await player.page.keyboard.type(code.slice(5));
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectParticipantCount(2);
  });

  test('a lower-case code is accepted as typed', async ({ host, player }) => {
    const code = await host.createSession();

    await player.page.goto(`${BASE_URL}/home`);
    await player.page.waitForURL(/\/(home|onboarding)/);
    if (player.page.url().includes('/onboarding')) await player.onboard();
    await player.page.locator(HOME.joinCard).click();
    await player.page.waitForURL(/\/join/);

    await fillRoomCode(player.page, code.toLowerCase());
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectParticipantCount(2);
  });
});
