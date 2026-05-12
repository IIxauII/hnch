import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

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

    // Host sees "Next Round" button, NOT "Re-vote"
    await expect(host.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn })).toBeVisible();
    await expect(host.page.locator(LOBBY.revoteBtn)).not.toBeVisible();

    // Player does NOT see host controls
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn }),
    ).not.toBeVisible();
    await expect(player.page.locator(LOBBY.revoteBtn)).not.toBeVisible();
  });

  test('joiner does not see skip story option in action sheet', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.startRound();
    await player.waitForEstimating();

    // Player opens the ⋯ menu
    const playerMenuBtn = player.page.locator('ion-header').locator('ion-button').last();
    await playerMenuBtn.click();

    // "Skip round" should NOT be visible (only for host)
    const skipBtn = player.page.locator(`ion-action-sheet button:has-text("Skip round")`);
    const skipBtnPopover = player.page
      .locator('ion-popover')
      .getByRole('button', { name: 'Skip round' });

    const isActionSheetVisible = await skipBtn.isVisible().catch(() => false);
    const isPopoverVisible = await skipBtnPopover.isVisible().catch(() => false);

    if (isActionSheetVisible || isPopoverVisible) {
      throw new Error('Expected "Skip round" to NOT be visible for non-host player');
    }

    // Verify "Leave session" IS visible (sanity check that menu opened)
    const leaveBtn = player.page.locator(`ion-action-sheet button:has-text("Leave session")`);
    const leaveBtnPopover = player.page
      .locator('ion-popover')
      .getByRole('button', { name: 'Leave session' });

    const isLeaveActionSheetVisible = await leaveBtn.isVisible().catch(() => false);
    const isLeavePopoverVisible = await leaveBtnPopover.isVisible().catch(() => false);

    if (!isLeaveActionSheetVisible && !isLeavePopoverVisible) {
      throw new Error('Expected "Leave session" to be visible in action sheet');
    }
  });
});
