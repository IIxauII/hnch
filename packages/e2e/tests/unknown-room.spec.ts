import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, JOIN, expectToast, fillRoomCode, watchForToast } from './fixtures/helpers';

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

    // Every time the relay is asked about the code
    let lookups = 0;
    player.page.on('request', (request) => {
      if (request.method() === 'GET' && /\/rooms\/A2B3C4(?:$|\?)/u.test(request.url())) {
        lookups += 1;
      }
    });

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
    expect(lookups).toBe(1);
    await player.page.waitForTimeout(1_500);
    expect(lookups).toBe(1);
    expect(player.page.url()).toContain('/join');

    // ...but Join still works for a deliberate retry. getByRole reaches the
    // native button inside ion-button, which is what carries `disabled`.
    const joinBtn = player.page
      .locator('app-join')
      .getByRole('button', { name: 'Join', exact: true });
    await expect(joinBtn).toBeEnabled();
    await expect(player.page.locator('ion-toast:not(.overlay-hidden)')).toHaveCount(0, {
      timeout: 8_000,
    });
    await joinBtn.click();
    await expectToast(player.page, "That code isn't active");
    expect(lookups).toBe(2);
    expect(player.page.url()).toContain('/join');
  });

  // The field stays editable while a code is looked up. A typo that is
  // corrected before the relay has answered is a code the user has left
  // behind: nothing is said about it, and the one they meant is joined.
  test('a code corrected while it is looked up is not complained about', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.page.goto(`${BASE_URL}/home`);
    await player.page.waitForURL(/\/(home|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      await player.onboard();
    }
    await player.page.locator(HOME.joinCard).click();
    await player.page.waitForURL(/\/join/);

    // A relay that takes its time over the mistyped code
    let answer!: () => void;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await player.page.route(/\/rooms\/A2B3C4$/u, async (route) => {
      await held;
      await route.continue();
    });
    const complained = await watchForToast(player.page, "That code isn't active");
    const asked = player.page.waitForRequest(/\/rooms\/A2B3C4$/u);

    await fillRoomCode(player.page, 'A2B3C4');
    await asked;
    // Typed over, tile by tile, while the question is out
    await fillRoomCode(player.page, code);
    const tiles = player.page.locator(JOIN.codeInput).locator('input');
    expect(
      (await tiles.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))).join(''),
    ).toBe(code);
    answer();

    await player.page.waitForURL(/\/lobby/, { timeout: 15_000 });
    await host.expectParticipantCount(2);
    expect(await complained.seen()).toBe(false);
  });
});
