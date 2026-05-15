import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

// Issue #109 — ticket ID exposure in the round-start modal.
// Covers AC #2 (ticketId written), #3 (results heading format),
// #4 (history row format), #8 (cross-client sync).
test.describe('Round ticket ID', () => {
  test('host enters ticket ID; both clients see "PROJ-42 · Auth migration" in results heading and history', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Round 1: title + ticketId
    await host.startRound('Auth migration', 'PROJ-42');
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    const descriptor = LOBBY.resultsSection + ' p.results-descriptor';
    await expect(host.page.locator(descriptor)).toHaveText('PROJ-42 · Auth migration', {
      timeout: 3_000,
    });
    await expect(player.page.locator(descriptor)).toHaveText('PROJ-42 · Auth migration', {
      timeout: 3_000,
    });

    // Start Round 2 to push Round 1 into history list — verify history row label.
    await host.nextRound('Profile redesign', 'PROJ-77');
    await player.waitForEstimating();
    await host.castVote('3');
    await player.castVote('3');
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    const historyRow1 = 'app-round-history li:has(.round-label:text-is("Round 1")) .round-title';
    await expect(host.page.locator(historyRow1)).toHaveText(': PROJ-42 · Auth migration', {
      timeout: 3_000,
    });
    await expect(player.page.locator(historyRow1)).toHaveText(': PROJ-42 · Auth migration', {
      timeout: 3_000,
    });
  });

  test('ticket-ID-only round (no title) shows ticketId alone', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // No title; ticketId only
    await host.startRound(undefined, 'PROJ-99');
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    const descriptor = LOBBY.resultsSection + ' p.results-descriptor';
    await expect(host.page.locator(descriptor)).toHaveText('PROJ-99', { timeout: 3_000 });
    await expect(player.page.locator(descriptor)).toHaveText('PROJ-99', { timeout: 3_000 });
  });
});
