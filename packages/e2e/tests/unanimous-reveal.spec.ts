import { test } from './fixtures/app.fixture';

test.describe('Unanimous reveal', () => {
  test('auto-reveals when all participants have voted', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Start round
    await host.startRound();
    await player.waitForEstimating();

    // Both vote — auto-reveal should fire once all have voted
    await host.castVote('3');
    await player.castVote('5');

    // Both auto-navigate to /lobby with results (no manual Reveal tap needed)
    await host.page.waitForURL(/\/lobby/, { timeout: 5_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 5_000 });

    // Both see correct votes in the results section
    await host.expectRevealedVotes(['3', '5']);
    await player.expectRevealedVotes(['3', '5']);
  });
});
