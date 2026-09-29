/**
 * Spec 1 — Voluntary leave (ADR-0036)
 *
 * Invariants verified:
 * - After B leaves, A's lobby active roster no longer shows B.
 * - Participant count header decrements.
 * - B's vote in the already-revealed round still appears as a named chip
 *   in VoteResultsComponent on A's screen (raw participants map preserved,
 *   name lookup still resolves — "You (Player)" omitted; B shows as "Player").
 * - B lands on /home, where the session they just left is not offered.
 */

import { test, expect } from './fixtures/app.fixture';
import { HOME, LOBBY } from './fixtures/helpers';

test.describe('Participant voluntary leave (ADR-0036)', () => {
  test('leaver removed from active roster; host sees count decrement', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Both in lobby — count is 2
    await host.expectParticipantCount(2);

    // Player leaves
    await player.leaveSession();

    // Host sees count drop to 1
    await host.expectParticipantCount(1);

    // Player's name no longer in active participant list
    const participantList = host.page.locator(LOBBY.participantList);
    await expect(participantList).not.toContainText('Player');
  });

  test("leaver's vote still shows by name in revealed round results on host screen", async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Run a round — player votes 8, host votes 5
    await host.startRound();
    await player.waitForEstimating();

    await host.castVote('5');
    await player.castVote('8');

    // Host manually reveals (prevents auto-reveal race while we're still voting)
    await host.reveal();
    // Wait for player to land on lobby too (ensures Yjs sync settled)
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Player leaves session after reveal
    await player.leaveSession();

    // Host is back on /lobby with results visible
    await host.page.waitForURL(/\/lobby/);
    const resultsSection = host.page.locator(LOBBY.resultsSection);
    await resultsSection.waitFor({ state: 'visible', timeout: 5_000 });

    // Player's vote chip shows the name "Player", not a raw ID
    const chips = host.page.locator(LOBBY.voterChips);
    const chipTexts = await chips.allTextContents();
    const hasPlayerName = chipTexts.some((t) => t.trim() === 'Player');
    expect(hasPlayerName).toBe(true);
  });

  test('after leave, the session is not offered on Home', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await player.page.waitForURL(/\/lobby/);

    // Leave explicitly (writes leftAt, clears cache per ADR-0036 §5)
    await player.leaveSession();
    await player.page.waitForURL(/\/home/);
    await player.page.locator(HOME.createCard).waitFor({ state: 'visible' });

    // Nothing to jump back into
    await expect(player.page.locator(HOME.recentRow)).toHaveCount(0);

    // Verify the code we left doesn't appear anywhere on Home
    const homeContent = await player.page.locator('app-home').textContent();
    expect(homeContent).not.toContain(`${code.slice(0, 3)}-${code.slice(3)}`);
  });
});
