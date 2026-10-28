import { test, expect } from './fixtures/app.fixture';
import { HOME, LOBBY } from './fixtures/helpers';

/**
 * Back-chevron soft exit
 *
 * Invariants:
 * 1. Lobby back chevron → /home (soft exit): last-session cache preserved →
 *    the session is listed under "Jump back in" → tap it → /lobby/:code restored.
 * 2. Estimating back chevron → /lobby/:code (in-session nav, NOT home):
 *    session NOT torn down, lobby state intact.
 *
 * These are separate tests so failures are reported independently.
 *
 * Ordering (test 1): create → soft-exit lobby → assert row → tap → assert
 * lobby restored. The row must be visible before tap; the restored lobby
 * must show the same code.
 *
 * Ordering (test 2): create → start round → assert estimating → soft-exit
 * estimating → assert lobby/:code (not home), session alive.
 */
test.describe('Back-chevron soft exit', () => {
  test('lobby back chevron navigates to /home with the session listed, tap returns to /lobby/:code', async ({
    host,
  }) => {
    const code = await host.createSession();
    await host.page.waitForURL(/\/lobby\//);

    // Capture canonical lobby URL
    const lobbyUrl = host.page.url();
    expect(lobbyUrl).toMatch(/\/lobby\/[A-Z0-9]+/i);

    // Tap header back chevron — first button in the lobby header (slot="start").
    // Use .first() rather than aria-label attribute selector because Ionic web
    // components may transfer aria-label into shadow DOM after hydration.
    const backBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-header ion-button')
      .first();
    await backBtn.waitFor({ state: 'visible' });
    await backBtn.click();

    // Soft exit → /home, cache preserved
    await host.page.waitForURL(/\/home/);

    // The session is offered under "Jump back in" (cache intact)
    const row = host.page.locator(HOME.recentRow);
    await expect(row).toHaveCount(1);

    // The row shows the code the way the lobby does: "XXX-XXX"
    await expect(row).toContainText(`${code.slice(0, 3)}-${code.slice(3)}`);

    // Tap the row → navigate back to /lobby/:code
    await row.click();
    await host.page.waitForURL(/\/lobby\//, { timeout: 15_000 });

    // Lands on same URL
    expect(host.page.url()).toBe(lobbyUrl);

    // State intact: participant count still 1, room code visible
    await host.expectParticipantCount(1);
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
  });

  test('estimating back chevron navigates to /lobby/:code — session not torn down', async ({
    host,
  }) => {
    await host.createSession();
    await host.page.waitForURL(/\/lobby\//);

    const lobbyUrl = host.page.url();

    // Start a round to reach /estimating/:code
    await host.startRound();
    await host.page.waitForURL(/\/estimating\//);

    // Tap estimating back chevron — first button in the estimating header (slot="start").
    const backBtn = host.page
      .locator('app-estimating:not(.ion-page-hidden) ion-header ion-button')
      .first();
    await backBtn.waitFor({ state: 'visible' });
    await backBtn.click();

    // Soft exit → /lobby/:code (same code, NOT /home)
    await host.page.waitForURL(/\/lobby\//, { timeout: 10_000 });
    expect(host.page.url()).toBe(lobbyUrl);

    // Session alive: room code visible, host controls present
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
    await host.expectIsHost();

    // Participant count still 1 — session not torn down
    await host.expectParticipantCount(1);

    // Still in-session: the lobby is the page showing, not home
    await expect(host.page.locator('app-lobby:not(.ion-page-hidden)')).toHaveCount(1);
    await expect(host.page.locator('app-home:not(.ion-page-hidden)')).toHaveCount(0);
  });
});
