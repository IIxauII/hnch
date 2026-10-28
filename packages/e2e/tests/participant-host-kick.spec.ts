/**
 * Spec 2 — Host removes a participant (ADR-0036)
 *
 * Ordering invariant:
 * Host writes `leftAt` + `removedBy = hostId` to B's record.
 * The session events driver on B's context sees the undefined→defined
 * transition, and ParticipantRemovalService (its sink) shows the toast,
 * clears the cache and navigates Home. That observation
 * must happen after the host confirms the alert — the test enforces this by
 * awaiting A's alert confirm before asserting B's toast/navigation.
 *
 * The action lives behind the ⋯ button on the participant's roster row —
 * one visible affordance on every surface (`Participant.removeParticipant`).
 */

import { test, expect } from './fixtures/app.fixture';
import { HOME, LOBBY, expectToast, rememberedSessionCodes } from './fixtures/helpers';

test.describe('Host kick participant (ADR-0036)', () => {
  test('host removes player via the row menu; player gets toast and lands on Home', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // ⋯ on Player's row → Remove → confirm
    await host.removeParticipant('Player');

    // Host sees count decrement and Player gone from list
    await host.expectParticipantCount(1);
    await expect(host.page.locator(LOBBY.participantList)).not.toContainText('Player');

    // Kicked player sees "Removed by host" toast and navigates Home
    // Ordering invariant: toast must appear after host confirm (causally after leftAt write)
    await expectToast(player.page, /removed by host/i, { timeout: 8_000 });
    await player.page.waitForURL(/\/home/, { timeout: 8_000 });
  });

  test("kicked player's vote still shows by name in revealed round results on host screen", async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Run a round: player votes 8, host votes 5
    await host.startRound();
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('8');

    // Host reveals
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Now kick player
    await host.removeParticipant('Player');

    // Wait for host to see the active list update
    await host.expectParticipantCount(1);

    // Results section still shows Player's vote chip by name
    const resultsSection = host.page.locator(LOBBY.resultsSection);
    await resultsSection.waitFor({ state: 'visible', timeout: 5_000 });
    const chips = host.page.locator(LOBBY.voterChips);
    const chipTexts = await chips.allTextContents();
    const hasPlayerName = chipTexts.some((t) => t.trim() === 'Player');
    expect(hasPlayerName).toBe(true);
  });

  test('after kick, the session is not offered on the kicked player Home', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);
    await expect.poll(() => rememberedSessionCodes(player.page)).toContain(code);

    // Kick player
    await host.removeParticipant('Player');

    await player.page.waitForURL(/\/home/, { timeout: 8_000 });
    await player.page.locator(HOME.createCard).waitFor({ state: 'visible' });

    // Nothing to jump back into (cache cleared per ADR-0036 §5)
    await expect.poll(() => rememberedSessionCodes(player.page)).not.toContain(code);

    // And Home, read afresh, does not offer it
    await player.page.reload();
    await player.page.locator(HOME.createCard).waitFor({ state: 'visible' });
    await expect(player.page.locator(HOME.recentRow)).toHaveCount(0);
    expect(await rememberedSessionCodes(player.page)).not.toContain(code);
  });

  test('kicked player can rejoin: host sees participant reappear in active roster (ADR-0036 §6)', async ({
    host,
    player,
  }) => {
    // Full ADR-0036 §6 contract: a kicked participant re-enters the room code,
    // the post-sync leftAt clear (onSynced hook in DocService.connectWithPersistence)
    // runs AFTER the relay snapshot merges so the delete op carries a higher
    // Lamport clock than the snapshot's set('leftAt', ...) and wins the LWW merge.
    // The host's active roster increments back to 2 and shows Player's name.
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Kick player
    await host.removeParticipant('Player');

    await player.page.waitForURL(/\/home/, { timeout: 8_000 });

    // Player re-enters the room code (no relay-side ban per ADR-0036 §6).
    await player.joinSession(code);

    // Assert: player reaches lobby — relay accepted the connection.
    await expect(player.page.locator(LOBBY.roomCode)).toBeVisible({ timeout: 10_000 });
    expect(player.page.url()).toMatch(/\/lobby/);

    // Assert: host sees count back at 2 and Player's name in the active roster.
    // This confirms the post-sync leftAt clear resolved the LWW race.
    await host.expectParticipantCount(2);
    await expect(host.page.locator(LOBBY.participantList)).toContainText('Player');
  });
});
