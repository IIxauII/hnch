import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, JOIN, fillRoomCode } from './fixtures/helpers';

/**
 * Room full rejection test.
 *
 * To run this test, set HNCH_ROOM_CAP=3 when starting the relay:
 *   HNCH_ROOM_CAP=3 pnpm --filter @hnch/relay dev
 *
 * The test fills a room to capacity (3 participants) and verifies the
 * 4th joiner receives a room-full close code (4006) and is directed
 * to the home page with an error toast.
 */
test.describe('Room full rejection', () => {
  test('room-full rejection shows toast and navigates to home', async ({
    host,
    createParticipant,
  }) => {
    test.setTimeout(30_000);
    // The relay is configured via HNCH_ROOM_CAP env var (default: 20).
    // For this test, we use a cap of 3, so the 4th joiner will be rejected.

    // Host creates a session
    const code = await host.createSession();

    // Fill the room to capacity: cap is 3, so create 2 additional participants (host + 2 = 3)
    const participants = [host];
    const player1 = await createParticipant('Player1');
    await player1.joinSession(code);
    participants.push(player1);

    const player2 = await createParticipant('Player2');
    await player2.joinSession(code);
    participants.push(player2);

    // Verify host sees 3 participants
    await host.expectParticipantCount(3);

    // 4th participant (overflow) attempts to join — WS upgrade fails with code 4006
    const overflow = await createParticipant('Overflow');
    await overflow.page.goto(`${BASE_URL}/home`);
    await overflow.page.waitForURL(/\/(home|onboarding)/);
    if (overflow.page.url().includes('/onboarding')) {
      await overflow.onboard();
    }

    // Navigate to join page
    await overflow.page.locator(HOME.joinCard).click();
    await overflow.page.waitForURL(/\/join/);
    await fillRoomCode(overflow.page, code);
    await overflow.page.locator(JOIN.joinBtn).click();

    // Room is full → WS close code 4006 arrives → join page should show
    // room-full toast and navigate to home. The join.page.ts component
    // watches for lastRejection() signal and calls router.navigate(['/home']).

    // Verify navigation back to /home (this is the guarantee)
    await overflow.page.waitForURL(/\/home/, { timeout: 10_000 });

    // Optionally verify the toast appeared (it should, but focus on nav)
    const toasts = overflow.page.locator('ion-toast');
    const count = await toasts.count();
    expect(count).toBeGreaterThan(0);

    // The other participants should still see 3
    for (const p of participants) {
      await p.expectParticipantCount(3);
    }
  });
});
