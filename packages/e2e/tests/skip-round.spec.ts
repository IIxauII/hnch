import { test, expect } from './fixtures/app.fixture';
import { LOBBY, SESSION_TOOLBAR } from './fixtures/helpers';

test.describe('Skip round', () => {
  test('host skips a round and both clients navigate to lobby with skipped label', async ({
    host,
    player,
    createParticipant,
  }) => {
    const third = await createParticipant('Third');

    const code = await host.createSession();
    await player.joinSession(code);
    await third.joinSession(code);
    await host.startRound();
    await player.waitForEstimating();
    await third.waitForEstimating();

    // Host casts vote. With 3 voters, auto-reveal won't fire until all 3 vote
    await host.castVote('5');

    // Host opens ⋯ menu and skips
    await host.skipRound();

    // Both navigate to /lobby
    await expect(host.page).toHaveURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Lobby shows "Round skipped" label in results area
    const skippedLabel = host.page.locator('p.round-skipped');
    await expect(skippedLabel).toContainText('Round skipped');
    await expect(player.page.locator('p.round-skipped')).toContainText('Round skipped');

    // Host sees "Next round" button, NOT "Re-vote"
    await expect(host.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn })).toBeVisible();
    await expect(host.page.locator(LOBBY.revoteBtn)).not.toBeVisible();

    // Player does NOT see host controls
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn }),
    ).not.toBeVisible();
    await expect(player.page.locator(LOBBY.revoteBtn)).not.toBeVisible();
  });

  test('joiner has no round menu, so nothing to skip a round from', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.startRound();
    await player.waitForEstimating();

    const hostPage = host.page.locator('app-estimating:not(.ion-page-hidden)');
    const joinerPage = player.page.locator('app-estimating:not(.ion-page-hidden)');

    // "Skip round" lives in the host's ⋯ menu...
    await expect(hostPage.getByRole('button', { name: SESSION_TOOLBAR.menuBtn })).toBeVisible();

    // ...which the joiner does not have. Their toolbar holds Leave, and no
    // Reveal button waits at the bottom.
    await expect(joinerPage.getByRole('button', { name: SESSION_TOOLBAR.menuBtn })).toHaveCount(0);
    await expect(joinerPage.getByRole('button', { name: SESSION_TOOLBAR.leaveBtn })).toBeVisible();
    await expect(joinerPage.locator('ion-footer')).toHaveCount(0);
  });
});
