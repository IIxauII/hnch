import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

test.describe('Rejoin / snapshot rehydration', () => {
  test('disconnected client rejoins and sees current session state', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Verify both participants are in the lobby
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);

    // Player disconnects (from the lobby, before a round starts,
    // so reconnect lands back on the lobby rather than estimating)
    await player.disconnect();

    // Brief pause for the relay to process the disconnect
    await host.page.waitForTimeout(2_000);

    // Player reconnects using the same code
    await player.reconnect(code);

    // Player should be back in the lobby
    // The session state should be preserved

    // Verify participant count is back to 2
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);

    // Verify settings are preserved (default Fibonacci scale in subtitle).
    // Player is non-host, so the subtitle renders as plain text
    // (host gets button.subtitle); LOBBY.subtitle selector matches both.
    await expect(player.page.locator(LOBBY.subtitle)).toContainText('Fibonacci');
  });
});
