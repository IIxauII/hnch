import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

test.describe('Session creation', () => {
  test('host creates a session and sees the lobby', async ({ host }) => {
    const code = await host.createSession();

    // Room code is 6 alphanumeric characters
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Room code is in the DOM (mobile card hidden at desktop, but textContent readable)
    const codeEl = host.page.locator(LOBBY.roomCode);
    await codeEl.waitFor({ state: 'attached' });
    const displayedCode = await codeEl.textContent();
    expect(displayedCode?.replaceAll(/[^A-Z0-9]/gi, '')).toBe(code);

    // Participant count is 1
    await host.expectParticipantCount(1);

    // Host sees "Start Round 1" button
    await expect(host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })).toBeVisible();
  });
});
