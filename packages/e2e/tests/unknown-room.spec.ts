import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, JOIN, fillRoomCode } from './fixtures/helpers';

test.describe('Unknown room handling', () => {
  test('joining a nonexistent code shows error toast and stays on join page', async ({
    player,
  }) => {
    // Navigate to join page
    await player.page.goto(`${BASE_URL}/home`);
    await player.page.waitForURL(/\/(home|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      await player.onboard();
    }
    await player.page.locator(HOME.joinCard).click();
    await player.page.waitForURL(/\/join/);

    // Enter a valid-format but nonexistent room code
    await fillRoomCode(player.page, 'A2B3C4');
    await player.page.locator(JOIN.joinBtn).click();

    // Phase D: join page shows inline error text (p.error-text) instead of a toast
    // for unknown-room rejection. The redesign avoids full-page toast for inline errors.
    const errorEl = player.page.locator('p.error-text[role="alert"]');
    await errorEl.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(errorEl).toContainText("isn't active");

    // Should stay on the join page
    expect(player.page.url()).toContain('/join');
  });
});
