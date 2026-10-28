import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING, QR_MODAL } from './fixtures/helpers';

/**
 * A sheet belongs to the page it was opened from.
 *
 * The Lobby's sheets are overlays: they are drawn over the app, not inside
 * the page. When the round starts, everyone in the Lobby is taken to the
 * round — and a sheet that was open would come along, over the cards, for
 * the participant to close before they can vote.
 */
test.describe('A sheet that is open when the round starts', () => {
  test('stays behind, and is not there again afterwards', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await player.page.locator(QR_MODAL.showBtn).click();
    await expect(player.page.locator(QR_MODAL.img)).toBeVisible();

    await host.startRound();
    await player.waitForEstimating();

    // Gone, with everything it laid over the page
    await expect(player.page.locator('app-qr-display-sheet')).toHaveCount(0);
    await expect(player.page.locator('ion-modal.show-modal')).toHaveCount(0);
    await expect(player.page.locator('ion-backdrop:visible')).toHaveCount(0);

    // Nothing is in the way of a vote
    await player.castVote('5');
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('1 of 2');

    // Back in the Lobby it is the Lobby that shows, not the sheet again
    await host.castVote('8');
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.expectRevealedVotes(['5', '8']);
    await expect(player.page.locator('app-qr-display-sheet')).toHaveCount(0);
  });
});
