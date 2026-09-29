import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, JOIN, expectToast, fillRoomCode } from './fixtures/helpers';

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

    // Enter a valid-format but nonexistent room code. The sixth character submits.
    await fillRoomCode(player.page, 'A2B3C4');

    // Expect the "isn't active" toast to appear
    await expectToast(player.page, "That code isn't active");

    // Should stay on the join page, code still in the tiles and ready to fix
    expect(player.page.url()).toContain('/join');
    const tiles = player.page.locator(JOIN.codeInput).locator('input');
    await expect(tiles).toHaveCount(6);
    expect(
      await tiles.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    ).toEqual(['A', '2', 'B', '3', 'C', '4']);

    // The same code is not submitted again on its own...
    await player.page.waitForTimeout(1_000);
    expect(player.page.url()).toContain('/join');

    // ...but Join still works for a deliberate retry.
    await expect(player.page.locator(JOIN.joinBtn)).toBeEnabled();
  });
});
