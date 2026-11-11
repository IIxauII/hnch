/**
 * Who may change a session's password (ADR-0059): the relay takes it from the
 * host alone, proven by this device's key for the room. The host role moves
 * by a handoff or by an election, and the power to change access moves with
 * it. Setting and clearing as the creator is `password-change.spec.ts`.
 */

import { test, expect } from './fixtures/app.fixture';
import { LOBBY, SETTINGS_SHEET } from './fixtures/helpers';

test.describe('Host-only access changes', () => {
  test('after a handoff the new host can change the password and the old host loses the control', async ({
    host,
    player,
    createParticipant,
  }) => {
    const lateJoiner = await createParticipant('LateJoiner');
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Relay first, then the doc: the badge moves only once the relay has
    // moved its access holder.
    await host.makeHost('Player');
    await expect(player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })).toBeVisible({
      timeout: 8_000,
    });

    // The old host has no way into the session settings any more.
    await expect(host.page.locator(LOBBY.subtitleHostBtn)).toHaveCount(0);

    // The new host's change goes through: the helper waits for the relay's 200.
    await player.openSettings();
    await expect(player.page.locator(SETTINGS_SHEET.passwordInput)).toBeVisible();
    await player.setPassword('handed');
    await player.closeSettings();

    await lateJoiner.joinSessionWithPassword(code, 'handed');
    await player.expectParticipantCount(3);
  });

  test('after the host has been gone past the debounce, the elected host can change the password', async ({
    host,
    player,
    createParticipant,
  }) => {
    test.setTimeout(45_000);
    const lateJoiner = await createParticipant('LateJoiner');
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await host.disconnect();
    // Elected after the 5 s debounce; the relay's holder lapses on the same clock.
    await expect(player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })).toBeVisible({
      timeout: 15_000,
    });

    // The elected host claims the access holder with its first change.
    await player.openSettings();
    await player.setPassword('elected');
    await player.closeSettings();

    await lateJoiner.joinSessionWithPassword(code, 'elected');
    // The host who left is still on the roster, offline.
    await player.expectParticipantCount(3);
  });
});
