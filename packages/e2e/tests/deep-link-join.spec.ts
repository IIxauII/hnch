import type { Page } from '@playwright/test';

import { pageSettled } from './_screenshots/_helpers/settled';
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
    // The Lobby is in, and what it asks the relay on its way in is asked
    await player.expectParticipantCount(2);
    await pageSettled(player.page);

    // A join begins by asking the relay about the code.
    let lookups = 0;
    player.page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().endsWith(`/rooms/${code}`)) lookups += 1;
    });

    await player.page.goBack();

    await player.page.waitForURL(/\/join/);
    await player.page.waitForTimeout(2_000);
    expect(player.page.url()).toContain('/join');
    expect(lookups).toBe(0);
    // The code is still there, for a deliberate Join
    expect(await codeTyped(player.page)).toBe(code);
  });

  // The address changes before the Lobby has slid in. Back at that moment
  // is Back from a page that is not there yet.
  test('nor does going back while the lobby is still coming in', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinViaDeepLink(code);

    await player.page.goBack();

    await player.page.waitForURL(/\/join/);
    await player.page.waitForTimeout(2_000);
    expect(player.page.url()).toContain('/join');
    await pageSettled(player.page);
    await expect(player.page.locator('app-join:not(.ion-page-hidden)')).toBeVisible();
    expect(await codeTyped(player.page)).toBe(code);
  });
});

/** What the code field holds, tile by tile. */
async function codeTyped(page: Page): Promise<string> {
  const tiles = page.locator(JOIN.codeInput).locator('input');
  return (await tiles.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))).join(
    '',
  );
}
