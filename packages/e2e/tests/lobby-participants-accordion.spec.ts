import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

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

  test('post-reveal: participants collapsed, results visible', async ({ host, player }) => {
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

    // Header still visible
    await expect(host.page.locator(LOBBY.participantCount)).toBeVisible();

    // Participant rows hidden (accordion collapsed)
    const firstRow = host.page.locator(LOBBY.participantItems).first();
    await expect(firstRow).toBeHidden();

    // Results section visible
    await expect(host.page.locator(LOBBY.resultsSection)).toBeVisible();
  });

  test('post-reveal: tapping header expands the list', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.startRound();
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');

    // Wait for auto-reveal navigation
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });

    // Verify accordion is collapsed (rows hidden)
    const firstRow = host.page.locator(LOBBY.participantItems).first();
    await expect(firstRow).toBeHidden();

    // Tap accordion header
    await host.page.locator(LOBBY.participantCount).click();

    // Now first row visible
    await expect(firstRow).toBeVisible({ timeout: 2_000 });
  });
});
