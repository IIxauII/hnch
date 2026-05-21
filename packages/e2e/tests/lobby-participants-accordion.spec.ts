import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

/**
 * Lobby participants accordion behaviour.
 *
 * Pre-#266: participants auto-collapsed on first reveal regardless of
 * viewport. Post-#266: collapse is mobile-only (plan §5). These tests now
 * run at Playwright's default desktop viewport and assert the desktop
 * contract — both Participants and Results are visible after reveal; the
 * header click toggles expansion.
 */

test.describe('Lobby participants accordion', () => {
  test('pre-reveal: participants visible by default', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Header always visible
    await expect(host.page.locator(LOBBY.participantCount)).toBeVisible();

    // First participant row visible (host themselves)
    const firstRow = host.page.locator(LOBBY.participantItems).first();
    await expect(firstRow).toBeVisible();
  });

  test('post-reveal (desktop): participants and results both visible', async ({ host, player }) => {
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

    // Header visible
    await expect(host.page.locator(LOBBY.participantCount)).toBeVisible();

    // On desktop, participants stay expanded alongside results
    const firstRow = host.page.locator(LOBBY.participantItems).first();
    await expect(firstRow).toBeVisible();

    // Results section visible
    await expect(host.page.locator(LOBBY.resultsSection)).toBeVisible();
  });

  test('header click toggles participants accordion', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    const firstRow = host.page.locator(LOBBY.participantItems).first();
    await expect(firstRow).toBeVisible();

    // Tap header → collapses
    await host.page.locator(LOBBY.participantCount).click();
    await expect(firstRow).toBeHidden({ timeout: 2_000 });

    // Tap again → expands
    await host.page.locator(LOBBY.participantCount).click();
    await expect(firstRow).toBeVisible({ timeout: 2_000 });
  });
});
