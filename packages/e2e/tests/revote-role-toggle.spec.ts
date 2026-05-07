import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING, LOBBY } from './fixtures/helpers';

/**
 * AC-TEST-4.5: Voter↔viewer toggle re-vote eligibility.
 *
 * Verifies that a participant who toggled to viewer mid-round 1 can
 * toggle back to voter for round 2 (re-vote) and have their vote
 * included in the revealed results.
 */
test.describe('Re-vote eligibility after voter↔viewer toggle', () => {
  test('player toggles viewer mid-round, then back to voter on re-vote — vote counts', async ({
    host,
    player,
  }) => {
    // 1. Host creates session; player joins.
    const code = await host.createSession();
    await player.joinSession(code);

    // 2. Host starts round 1.
    await host.startRound();
    await player.waitForEstimating();

    // 3. Player casts a vote in round 1.
    await player.castVote('5');

    // 4. Player toggles to viewer/observer mid-round.
    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Observing' }).first(),
    ).toBeVisible();

    // 5. Host triggers reveal manually (player is now a viewer, excluded from denominator).
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // 6. Host starts round 2 (re-vote).
    await host.revote();
    await player.waitForEstimating();

    // 7. Player toggles back to voter.
    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Voter' }).first(),
    ).toBeVisible();

    // 8. Player casts a vote in round 2.
    await player.castVote('8');

    // Vote count confirms player is back in denominator (1 voted, host has not yet).
    await expect(player.page.locator(ESTIMATING.voteCount).first()).toContainText('1 of 2');

    // 9. Host votes — both voted, unanimous auto-reveal fires.
    await host.castVote('3');

    // Wait for auto-reveal navigation (don't call host.reveal() — it already fired).
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Player's round-2 vote ('8') appears in results alongside host's ('3').
    await host.expectRevealedVotes(['3', '8']);
    await player.expectRevealedVotes(['3', '8']);

    // Confirm we are on round 2.
    await expect(host.page.locator(LOBBY.resultsHeading)).toContainText('Round 2');
  });

  test('player as viewer is excluded from round 1 denominator after toggle', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();

    // Player toggles to viewer before voting — excluded from denominator.
    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Observing' }).first(),
    ).toBeVisible();

    // Host is the only voter; auto-reveal fires when host votes.
    await host.castVote('5');

    // Both land on /lobby without manual reveal.
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Only host's vote appears.
    await host.expectRevealedVotes(['5']);
    await player.expectRevealedVotes(['5']);

    // Re-vote: player toggles back to voter and votes.
    await host.revote();
    await player.waitForEstimating();

    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Voter' }).first(),
    ).toBeVisible();

    await player.castVote('13');
    await host.castVote('8');

    // Both voted — unanimous auto-reveal fires (don't call host.reveal()).
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    await host.expectRevealedVotes(['8', '13']);
    await player.expectRevealedVotes(['8', '13']);
  });
});
