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
 *    the case that revealed the round: with the gate in the auto-reveal
 *    driver (`presenceTrusted`) taken out, this test fails.
 *  - The other way round: the participant has voted and reloads. While it is
 *    away the host sees it go offline — a voter who has not voted remains,
 *    so the round must not reveal on that account either — and when it is
 *    back the round still waits for the host.
 *
 * Not covered, because it is not so: a voter who has NOT voted and goes
 * away takes itself out of "every online voter", and a round that was only
 * waiting for that one reveals (ADR-0018). The gate is about what a client
 * believes on its way in, not about who is counted.
 *
 * Two clients each. The relay in these tests takes three connections to a
 * session, and a reload opens the new one while the old one may not have
 * been counted out yet: a third client would put the reload at the limit.
 */
test.describe('Reload mid-round', () => {
  test('a voter who reloads does not reveal the round for everyone', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await host.startRound('Login form');
    await player.waitForEstimating();

    // One of two has voted
    await player.castVote('5');
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('1 of 2');

    // ...and reloads
    await player.page.reload();
    await player.waitForEstimating();

    // Long enough for a premature reveal to have happened and travelled
    await host.page.waitForTimeout(3_000);
    expect(host.page.url()).toContain('/estimating');
    expect(player.page.url()).toContain('/estimating');
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('1 of 2');
    await host.expectVotesHidden();

    // The vote survived the reload
    await expect(
      player.page.locator(`app-estimating:not(.ion-page-hidden) ${ESTIMATING.selectedCard}`),
    ).toHaveCount(1);

    // The round still reveals by itself once it should
    await host.castVote('8');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectRevealedVotes(['5', '8']);
    await player.expectRevealedVotes(['5', '8']);
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
