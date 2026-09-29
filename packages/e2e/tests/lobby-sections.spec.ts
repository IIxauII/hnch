import { devices } from '@playwright/test';
import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

/**
 * Lobby sections.
 *
 * The Lobby is a stack of plain cards: nothing collapses, so nothing a
 * participant needs is ever one tap away behind a header. One column on every
 * surface, ordered by what matters right now — the code, the newest result,
 * who is here, the agenda, the history. On desktop the column is capped and
 * centered (ux.md §3).
 */

const CARDS = {
  session: 'app-lobby:not(.ion-page-hidden) .session-card',
  results: 'app-lobby:not(.ion-page-hidden) .results-card',
  participants: 'app-lobby:not(.ion-page-hidden) .participants-card',
  agenda: 'app-lobby:not(.ion-page-hidden) .agenda-card',
} as const;

async function topOf(page: import('@playwright/test').Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not rendered`);
  return box.y;
}

async function leftOf(page: import('@playwright/test').Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not rendered`);
  return box.x;
}

test.describe('Lobby sections', () => {
  test('pre-reveal: participants visible, no results card', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await expect(host.page.locator(LOBBY.participantCount)).toBeVisible();
    await expect(host.page.locator(LOBBY.participantItems)).toHaveCount(2);
    await expect(host.page.locator(LOBBY.participantItems).first()).toBeVisible();
    await expect(host.page.locator(CARDS.results)).toHaveCount(0);
  });

  test('post-reveal (desktop): results above the roster, both on the page', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await host.startRound();
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');

    // Auto-reveal on unanimous (ADR-0018) navigates everyone back to /lobby
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });

    await expect(host.page.locator(LOBBY.participantCount)).toBeVisible();
    await expect(host.page.locator(LOBBY.participantItems).first()).toBeVisible();
    await expect(host.page.locator(LOBBY.resultsSection)).toBeVisible();

    // One capped column, centered: code, result, roster. Retried until the
    // page has finished its transition.
    await expect(async () => {
      const session = await host.page.locator(CARDS.session).boundingBox();
      const viewport = host.page.viewportSize();
      expect(session?.width).toBeLessThanOrEqual(800);
      expect(Math.abs(session!.x + session!.width / 2 - viewport!.width / 2)).toBeLessThan(12);
    }).toPass({ timeout: 5_000 });

    expect(await topOf(host.page, CARDS.session)).toBeLessThan(
      await topOf(host.page, CARDS.results),
    );
    expect(await topOf(host.page, CARDS.results)).toBeLessThan(
      await topOf(host.page, CARDS.participants),
    );
    await expect(async () => {
      const left = await leftOf(host.page, CARDS.session);
      expect(await leftOf(host.page, CARDS.results)).toBe(left);
      expect(await leftOf(host.page, CARDS.participants)).toBe(left);
    }).toPass({ timeout: 5_000 });

    // The round buttons line up with the column rather than spanning the window.
    const cta = await host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-footer .cta-inner')
      .boundingBox();
    expect(cta?.width).toBeLessThanOrEqual(800);
  });

  test('the section headings are not controls: nothing collapses', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    const firstRow = host.page.locator(LOBBY.participantItems).first();
    await expect(firstRow).toBeVisible();

    await host.page.locator(LOBBY.participantCount).click();

    await expect(firstRow).toBeVisible();
    await expect(host.page.locator(LOBBY.participantItems)).toHaveCount(2);
  });
});

test.describe('Lobby sections on a phone', () => {
  // Strip defaultBrowserType — see lobby-host-actions-mobile.spec.ts.
  const { defaultBrowserType: _defaultBrowserType, ...IPHONE_13 } = devices['iPhone 13'];

  test('one column: code, then the newest result, then who is here', async ({ browser }) => {
    const { Participant } = await import('./fixtures/app.fixture');
    const hostCtx = await browser.newContext(IPHONE_13);
    const playerCtx = await browser.newContext(IPHONE_13);
    const host = new Participant(hostCtx, await hostCtx.newPage(), 'Host');
    const player = new Participant(playerCtx, await playerCtx.newPage(), 'Player');

    try {
      const code = await host.createSession();
      await player.joinSession(code);
      await host.expectParticipantCount(2);

      // Before any round: code, roster, agenda.
      expect(await topOf(host.page, CARDS.session)).toBeLessThan(
        await topOf(host.page, CARDS.participants),
      );
      expect(await topOf(host.page, CARDS.participants)).toBeLessThan(
        await topOf(host.page, CARDS.agenda),
      );

      await host.startRound();
      await player.waitForEstimating();
      await host.castVote('5');
      await player.castVote('5');
      await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
      await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });

      // After a reveal the result moves in right under the code, and the
      // roster is still on the page below it — not folded away.
      const session = await topOf(host.page, CARDS.session);
      const results = await topOf(host.page, CARDS.results);
      const participants = await topOf(host.page, CARDS.participants);
      expect(session).toBeLessThan(results);
      expect(results).toBeLessThan(participants);
      await expect(host.page.locator(LOBBY.participantItems)).toHaveCount(2);

      // One column: every card starts at the same left edge, a gutter in
      // from the screen's. Retried until the page has finished sliding in.
      await expect(async () => {
        const left = await leftOf(host.page, CARDS.session);
        expect(left).toBe(16);
        expect(await leftOf(host.page, CARDS.results)).toBe(left);
        expect(await leftOf(host.page, CARDS.participants)).toBe(left);
      }).toPass({ timeout: 5_000 });

      // Nothing is wider than the screen.
      const scrollWidth = await host.page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(host.page.viewportSize()!.width);
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});
