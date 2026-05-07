import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING } from './fixtures/helpers';

test.describe('Voting flow', () => {
  test('both clients vote and votes remain hidden', async ({ host, player, createParticipant }) => {
    // Add a 3rd non-voting participant to prevent unanimous auto-reveal
    const nonVoter = await createParticipant('NonVoter');

    const code = await host.createSession();
    await player.joinSession(code);
    await nonVoter.joinSession(code);

    // Host starts round
    await host.startRound();
    await player.waitForEstimating();
    await nonVoter.waitForEstimating();

    // Both host and player cast votes (nonVoter doesn't vote, so auto-reveal won't fire)
    await host.castVote('5');
    await player.castVote('8');

    // Host's selected card is highlighted
    await expect(host.page.locator(ESTIMATING.card('5'))).toHaveClass(/selected/);

    // Player's selected card is highlighted
    await expect(player.page.locator(ESTIMATING.card('8'))).toHaveClass(/selected/);

    // Vote count shows "2 of 3 voted"
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('2 of 3');
    await expect(player.page.locator(ESTIMATING.voteCount)).toContainText('2 of 3');

    // All are still on estimating (not revealed) because nonVoter hasn't voted
    await host.expectVotesHidden();
    await player.expectVotesHidden();
    await nonVoter.expectVotesHidden();
  });
});
