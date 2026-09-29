import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, JOIN, expectToast, fillRoomCode } from './fixtures/helpers';

test.describe('Password-protected rooms', () => {
  test('joiner must enter correct password to join', async ({ host, player }) => {
    const code = await host.createSession();

    // Host sets a password — wait for the relay PATCH to complete
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('secret123');
    await patchDone;
    await host.closeSettings();

    // Player joins with the correct password
    await player.joinSessionWithPassword(code, 'secret123');

    // Both see each other
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });

  test('wrong password shows rejection and stays on join page', async ({ host, player }) => {
    const code = await host.createSession();

    // Host sets a password
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('correctpw');
    await patchDone;
    await host.closeSettings();

    // Player tries to join with the wrong password
    await player.page.goto(`${BASE_URL}/home`);
    await player.page.waitForURL(/\/(home|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      await player.onboard();
    }
    await player.page.locator(HOME.joinCard).click();
    await player.page.waitForURL(/\/join/);
    // The sixth character resolves the code and reveals the password field
    await fillRoomCode(player.page, code);

    // Wait for password field. It takes the focus: the next thing typed is
    // the password, with no tap in between.
    const pwInput = player.page.locator(JOIN.passwordInput).locator('input');
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(pwInput).toBeFocused();
    await player.page.keyboard.type('wrongpassword');
    await expect(pwInput).toHaveValue('wrongpassword');
    await player.page.locator(JOIN.joinBtn).click();

    // Says so, and stays on the join page (does not navigate to lobby)
    await expectToast(player.page, 'That password is incorrect');
    expect(player.page.url()).toContain('/join');

    // The code is kept and the password field is emptied for another go —
    // and has the focus again
    await expect(pwInput).toHaveValue('');
    await expect(pwInput).toBeFocused();
    await expect(player.page.locator('app-lobby')).toHaveCount(0);
  });

  // Leading and trailing whitespace is not part of a password, on either side.
  test('a password pasted with a space after it still opens the session', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await host.openSettings();
    await host.setPassword('  secret123 ');
    await host.closeSettings();

    await player.joinSessionWithPassword(code, 'secret123  ');

    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });

  test('removing password lets joiner in without one', async ({ host, player }) => {
    const code = await host.createSession();

    // Host sets a password
    const setPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('temppass');
    await setPatch;
    await host.closeSettings();

    // Host removes the password via the UI
    const removePatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.removePassword();
    await removePatch;
    await host.closeSettings();

    // Player joins normally (no password needed)
    await player.joinSession(code);
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });
});
