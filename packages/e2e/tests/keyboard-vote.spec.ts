import { expect, test } from './fixtures/app.fixture';
import { ESTIMATING } from './fixtures/helpers';

/**
 * Issue #154 — keyboard shortcuts on the Estimating card grid.
 *
 * Coverage:
 *  - Digit cast + real-time propagation to a second client.
 *  - Re-pressing the bound digit clears the vote (toggle).
 *  - Arrow nav (focus only) then Enter commits at the focused index.
 *  - Overlay guard: pressing a digit while the ⋯ action-sheet/popover
 *    is open must not cast a vote.
 */
test.describe('Keyboard shortcuts on Estimating', () => {
  test('digit casts vote, peer sees the avatar fill, re-press clears', async ({
    host,
    player,
    createParticipant,
  }) => {
    // Third non-voting participant so unanimous auto-reveal does not fire
    // mid-test and bounce host/player back to Lobby.
    const nonVoter = await createParticipant('NonVoter');

    const code = await host.createSession();
    await player.joinSession(code);
    await nonVoter.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();
    await nonVoter.waitForEstimating();

    // Fibonacci scale: ['0', '1', '2', '3', '5', '8', '13', '21'].
    // Digit1 → index 0 → card '0'.
    await host.page.locator('app-estimating').first().click();
    await host.page.keyboard.press('Digit1');
    await expect(host.page.locator(ESTIMATING.card('0'))).toHaveClass(/selected/);

    // Peer sees the avatar fill in real time (avatar dot toggles .voted).
    await expect(player.page.locator(ESTIMATING.votedDots)).toHaveCount(1, { timeout: 5_000 });

    // Re-press Digit1 → vote cleared.
    await host.page.keyboard.press('Digit1');
    await expect(host.page.locator(ESTIMATING.card('0'))).not.toHaveClass(/selected/);
    await expect(player.page.locator(ESTIMATING.votedDots)).toHaveCount(0, { timeout: 5_000 });
  });

  test('arrow keys move focus, Enter commits at focused index', async ({
    host,
    player,
    createParticipant,
  }) => {
    const nonVoter = await createParticipant('NonVoter');

    const code = await host.createSession();
    await player.joinSession(code);
    await nonVoter.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();
    await nonVoter.waitForEstimating();

    // Focus the first card directly to seed the roving tabindex anchor.
    await host.page.locator(ESTIMATING.card('0')).first().focus();

    // ArrowRight × 3 → focus index 3 → Fibonacci '3'.
    await host.page.keyboard.press('ArrowRight');
    await host.page.keyboard.press('ArrowRight');
    await host.page.keyboard.press('ArrowRight');
    await host.page.keyboard.press('Enter');

    await expect(host.page.locator(ESTIMATING.card('3'))).toHaveClass(/selected/);
  });

  test('digits are ignored while the ⋯ menu overlay is open', async ({
    host,
    player,
    createParticipant,
  }) => {
    const nonVoter = await createParticipant('NonVoter');

    const code = await host.createSession();
    await player.joinSession(code);
    await nonVoter.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();
    await nonVoter.waitForEstimating();

    // Open the ⋯ menu (action-sheet on mobile, popover on desktop).
    const ellipsis = host.page.locator(
      'app-estimating:not(.ion-page-hidden) ion-button[aria-label="More options"]',
    );
    await ellipsis.click();
    const overlay = host.page.locator('ion-action-sheet, ion-popover');
    await overlay.first().waitFor({ state: 'visible', timeout: 5_000 });

    // Digit1 with the overlay open must not cast.
    await host.page.keyboard.press('Digit1');
    await expect(host.page.locator(ESTIMATING.card('0'))).not.toHaveClass(/selected/);

    // Dismiss the overlay (Escape closes both ion-action-sheet and ion-popover).
    await host.page.keyboard.press('Escape');
    await overlay.first().waitFor({ state: 'hidden', timeout: 5_000 });

    // After dismissal the digit shortcut works again.
    await host.page.keyboard.press('Digit1');
    await expect(host.page.locator(ESTIMATING.card('0'))).toHaveClass(/selected/);
  });
});
