import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

test.describe('Re-vote full cycle', () => {
  test('re-vote from results → estimating → vote → reveal shows Round 2', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Round 1: vote and reveal
    await host.startRound('Design API');
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('8');
    // Unanimous auto-reveal (estimating.page.ts:322) fires when all online voters vote
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Verify Round 1 results are visible
    await expect(host.page.locator(LOBBY.resultsHeading)).toContainText('Round 1 results');

    // Re-vote from results
    await host.revote();
    await player.waitForEstimating();

    // Cast new votes
    await host.castVote('3');
    await player.castVote('5');

    // Unanimous auto-reveal again
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Results should show the new votes (3, 5)
    await host.expectRevealedVotes(['3', '5']);
    await player.expectRevealedVotes(['3', '5']);

    // Verify we're on Round 2 now — its number in the session, with a note
    // that it re-votes an earlier round
    const resultsHeading = host.page.locator(LOBBY.resultsHeading);
    await expect(resultsHeading).toContainText('Round 2 results');
    await expect(resultsHeading.locator('.hnch-card__title-note')).toHaveText('Re-vote');
    await expect(player.page.locator(LOBBY.resultsHeading)).toContainText('Round 2 results');

    // Round 1 moved to the history, under the number it always had
    const history = host.page.locator('app-round-history li.history-item');
    await expect(history).toHaveCount(1);
    await expect(history.locator('.round-label')).toHaveText('Round 1');
    await expect(history.locator('.revote-badge')).toHaveCount(0);
  });

  test('re-vote preserves title and does not affect prior round', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Round 1: vote and reveal
    await host.startRound('Auth migration');
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('8');
    // Unanimous auto-reveal (estimating.page.ts:322) fires when all online voters vote
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Record Round 1 results
    await host.expectRevealedVotes(['5', '8']);

    // Re-vote
    await host.revote();
    await player.waitForEstimating();

    // Vote differently
    await host.castVote('13');
    await player.castVote('13');

    // Unanimous auto-reveal again
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Round 2 results show new votes (13, 13)
    await host.expectRevealedVotes(['13', '13']);

    // Verify round history shows both rounds
    const roundHistory = host.page.locator('app-round-history');
    await expect(roundHistory).toBeVisible();
  });
});
