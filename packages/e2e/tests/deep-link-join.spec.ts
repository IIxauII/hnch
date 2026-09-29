import { test, expect } from './fixtures/app.fixture';
import { JOIN } from './fixtures/helpers';

test.describe('Deep-link join (/join?code=...)', () => {
  test('pre-fills code and joins when navigating via deep link', async ({ host, player }) => {
    const code = await host.createSession();

    // Player joins via deep link
    await player.joinViaDeepLink(code);

    // Both see each other
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });

  // The link is acted on when it is followed — not again every time the
  // page it opened is come back to, or the session could not be backed out of.
  test('going back from the lobby does not join the session again', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinViaDeepLink(code);
    await host.expectParticipantCount(2);

    await player.page.goBack();

    await player.page.waitForURL(/\/join/);
    await player.page.waitForTimeout(2_000);
    expect(player.page.url()).toContain('/join');
    // The code is still there, for a deliberate Join
    const tiles = player.page.locator(JOIN.codeInput).locator('input');
    expect(
      (await tiles.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))).join(''),
    ).toBe(code);
  });
});
