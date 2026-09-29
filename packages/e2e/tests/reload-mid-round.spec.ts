import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING } from './fixtures/helpers';

/**
 * Reload mid-round
 *
 * Invariant: a round reveals on its own only when every online voter has
 * voted (ADR-0018) — as seen by a client that knows who is online. A client
 * that has just (re)connected does not, for a moment: its own awareness entry
 * is the only one it holds until the relay's first sync arrives. If it has
 * already voted, "everyone online has voted" is true of that picture and false
 * of the room, and acting on it revealed the round for everybody.
 *
 * Two angles on it:
 *
 *  - The host has voted, the other voter has not, the host reloads. This is
 *    the case that revealed the round: with the sync gate in `DocService`
 *    taken out, this test fails.
 *  - One of three voters has voted and reloads. While it is away the other
 *    two see it go offline — two voters who have not voted remain, so the
 *    round must not reveal on that account either — and when it is back the
 *    round still waits for them.
 */
test.describe('Reload mid-round', () => {
  test('a voter who reloads does not reveal the round for everyone', async ({
    host,
    player,
    createParticipant,
  }) => {
    const third = await createParticipant('Third');

    const code = await host.createSession();
    await player.joinSession(code);
    await third.joinSession(code);
    await host.expectParticipantCount(3);

    await host.startRound('Login form');
    await player.waitForEstimating();
    await third.waitForEstimating();

    // One of three has voted
    await player.castVote('5');
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('1 of 3');

    // ...and reloads
    await player.page.reload();
    await player.waitForEstimating();

    // Long enough for a premature reveal to have happened and travelled
    await host.page.waitForTimeout(3_000);
    expect(host.page.url()).toContain('/estimating');
    expect(player.page.url()).toContain('/estimating');
    expect(third.page.url()).toContain('/estimating');
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('1 of 3');
    await host.expectVotesHidden();

    // The vote survived the reload
    await expect(
      player.page.locator(`app-estimating:not(.ion-page-hidden) ${ESTIMATING.selectedCard}`),
    ).toHaveCount(1);

    // The round still reveals by itself once it should
    await host.castVote('8');
    await third.castVote('8');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectRevealedVotes(['5', '8', '8']);
    await player.expectRevealedVotes(['5', '8', '8']);
  });

  test('the host reloading does not reveal the round either', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await host.startRound();
    await player.waitForEstimating();

    // The host has voted, the player has not
    await host.castVote('3');
    await expect(player.page.locator(ESTIMATING.voteCount)).toContainText('1 of 2');

    await host.page.reload();
    await host.waitForEstimating();

    await player.page.waitForTimeout(3_000);
    expect(host.page.url()).toContain('/estimating');
    expect(player.page.url()).toContain('/estimating');
    await expect(player.page.locator(ESTIMATING.voteCount)).toContainText('1 of 2');

    // Still the host, still able to reveal by hand
    await host.expectIsHost();
    await host.reveal();
    await host.expectRevealedVotes(['3']);
  });
});
