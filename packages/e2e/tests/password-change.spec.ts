/**
 * Mid-session password change scenarios.
 *
 * Verifies that a host can add, change, or remove a password while a session
 * is already live, and that subsequent joiners are governed by the new
 * access mode immediately — and that the change leaves the people already in
 * the session alone.
 */

import { test, expect } from './fixtures/app.fixture';
import {
  BASE_URL,
  HOME,
  JOIN,
  KICK_AFFORDANCE,
  LOBBY,
  expectToast,
  fillRoomCode,
} from './fixtures/helpers';

test.describe('Mid-session password change', () => {
  test('host adds password mid-session; new joiner must provide it', async ({
    host,
    player,
    createParticipant,
  }) => {
    const lateJoiner = await createParticipant('LateJoiner');

    // Host creates open session, player joins without password
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Host adds password while session is live
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('midpass');
    await patchDone;
    await host.closeSettings();

    // Late joiner must now provide the password to join
    await lateJoiner.joinSessionWithPassword(code, 'midpass');

    // All three are in the session
    await host.expectParticipantCount(3);
    await player.expectParticipantCount(3);
    await lateJoiner.expectParticipantCount(3);
  });

  /**
   * Setting a password reconnects the host's socket under the new credentials.
   * Presence has to survive that: `y-protocols` only accepts a state whose
   * clock has moved on, and a reconnect left both sides with clocks that had
   * not. Host and participant then each saw the other as offline for up to
   * 15 s — three times the host-election debounce (ADR-0010) — and the room
   * changed hands, and back, every five seconds.
   *
   * Ordering: both in → host sets password → wait out more than one election
   * debounce → nobody went offline, nobody else became host.
   */
  test('setting a password leaves everyone online and the host the host', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);

    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('midpass');
    await patchDone;
    await host.closeSettings();

    const hostRowOnPlayer = player.page.locator(KICK_AFFORDANCE.row('Host'));
    const playerRowOnHost = host.page.locator(KICK_AFFORDANCE.row('Player'));

    // Looked at once a second across 7 s: longer than one election debounce
    // (5 s), so a handover would have happened by the end of it. Looked at,
    // not waited for: a retrying assertion would sit through a flicker.
    for (let i = 0; i < 7; i++) {
      await host.page.waitForTimeout(1_000);
      expect(await playerRowOnHost.locator('ion-note').count(), `second ${i + 1}`).toBe(0);
      expect(await hostRowOnPlayer.locator('ion-note').count(), `second ${i + 1}`).toBe(0);
      expect(await hostRowOnPlayer.locator(LOBBY.hostIcon).count(), `second ${i + 1}`).toBe(1);
      expect(await playerRowOnHost.locator(LOBBY.hostIcon).count(), `second ${i + 1}`).toBe(0);
    }

    // The host still runs the session; the participant is still in it, on
    // the lobby, without having been asked for anything.
    await host.expectIsHost();
    await expect(player.page.locator(LOBBY.waitingNote)).toContainText('Waiting for Host');
    expect(player.page.url()).toContain('/lobby');
    await expect(player.page.locator(LOBBY.subtitle)).toContainText('Fibonacci');

    // ...and a round runs as if nothing had happened.
    await host.startRound();
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectRevealedVotes(['5', '5']);
  });

  // The participant's socket was opened before there was a password. The next
  // time it has to be opened again, the relay turns it away — and for good,
  // so the app must not leave them on a screen that will never sync again.
  test('a participant whose connection drops after the change is asked for the password', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await host.openSettings();
    await host.setPassword('midpass');
    await host.closeSettings();

    await player.page.context().setOffline(true);
    await player.page.waitForTimeout(1_000);
    await player.page.context().setOffline(false);

    // Told why, and taken to where the password can be entered
    await expectToast(player.page, "This session's password has changed", { timeout: 15_000 });
    await player.page.waitForURL(new RegExp(`/join\\?code=${code}`, 'u'), { timeout: 10_000 });
    const pwInput = player.page.locator(JOIN.passwordInput).locator('input');
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 });

    // With it, they are back in
    await pwInput.fill('midpass');
    await player.page.locator(JOIN.joinBtn).click();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });

  test('new joiner rejected with wrong password after mid-session lock', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();

    // Host adds password mid-session
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('correctpw');
    await patchDone;
    await host.closeSettings();

    // Player tries to join with wrong password
    await player.page.goto(`${BASE_URL}/home`);
    await player.page.waitForURL(/\/(home|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      await player.onboard();
    }
    await player.page.locator(HOME.joinCard).click();
    await player.page.waitForURL(/\/join/);
    // The sixth character resolves the code and reveals the password field
    await fillRoomCode(player.page, code);

    const pwInput = player.page.locator(JOIN.passwordInput).locator('input');
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 });
    await pwInput.fill('wrongpassword');
    await player.page.locator(JOIN.joinBtn).click();

    // Says so, and remains on join page — never navigates to lobby
    await expectToast(player.page, 'That password is incorrect');
    expect(player.page.url()).toContain('/join');
    await expect(pwInput).toHaveValue('');
    await expect(player.page.locator('app-lobby')).toHaveCount(0);
  });

  test('host changes password mid-session; old password rejected, new password accepted', async ({
    host,
    createParticipant,
  }) => {
    const joinerOldPw = await createParticipant('JoinerOldPw');
    const joinerNewPw = await createParticipant('JoinerNewPw');

    const code = await host.createSession();

    // Set initial password
    const firstPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('oldpassword');
    await firstPatch;
    await host.closeSettings();

    // Change to a new password
    const secondPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('newpassword');
    await secondPatch;
    await host.closeSettings();

    // Joiner with old password is rejected — stays on join page
    await joinerOldPw.page.goto(`${BASE_URL}/home`);
    await joinerOldPw.page.waitForURL(/\/(home|onboarding)/);
    if (joinerOldPw.page.url().includes('/onboarding')) {
      await joinerOldPw.onboard();
    }
    await joinerOldPw.page.locator(HOME.joinCard).click();
    await joinerOldPw.page.waitForURL(/\/join/);
    // The sixth character resolves the code and reveals the password field
    await fillRoomCode(joinerOldPw.page, code);
    const pwInputOld = joinerOldPw.page.locator(JOIN.passwordInput).locator('input');
    await pwInputOld.waitFor({ state: 'visible', timeout: 5_000 });
    await pwInputOld.fill('oldpassword');
    await joinerOldPw.page.locator(JOIN.joinBtn).click();
    await expectToast(joinerOldPw.page, 'That password is incorrect');
    expect(joinerOldPw.page.url()).toContain('/join');

    // Joiner with new password succeeds
    await joinerNewPw.joinSessionWithPassword(code, 'newpassword');
    await host.expectParticipantCount(2); // host + joinerNewPw (joinerOldPw never got in)
  });

  test('host removes password mid-session; new joiner enters without password', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();

    // Set password initially
    const setPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('temppass');
    await setPatch;
    await host.closeSettings();

    // Remove password while session is live
    const removePatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.removePassword();
    await removePatch;
    await host.closeSettings();

    // Player joins with no password — should succeed immediately
    await player.joinSession(code);
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });
});
