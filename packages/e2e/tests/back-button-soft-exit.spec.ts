import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

/**
 * Back-chevron soft exit
 *
 * Invariants:
 * 1. Lobby back chevron → /home (soft exit): last-session cache preserved →
 *    Jump-back-in banner visible → tap banner → /lobby/:code restored.
 * 2. Estimating back chevron → /lobby/:code (in-session nav, NOT home):
 *    session NOT torn down, lobby state intact.
 *
 * These are separate tests so failures are reported independently.
 *
 * Ordering (test 1): create → soft-exit lobby → assert banner → tap → assert
 * lobby restored. The banner must be visible before tap; the restored lobby
 * must show the same code.
 *
 * Ordering (test 2): create → start round → assert estimating → soft-exit
 * estimating → assert lobby/:code (not home), session alive.
 */
test.describe('Back-chevron soft exit', () => {
  test('lobby back chevron navigates to /home with Jump-back-in banner, tap returns to /lobby/:code', async ({
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
    await backBtn.evaluate((el: HTMLElement) => el.click());

    // Soft exit → /home, cache preserved
    await host.page.waitForURL(/\/home/);

    // Jump-back-in banner must appear (cache intact)
    const banner = host.page.locator('app-jump-back-in-banner');
    await banner.waitFor({ state: 'visible', timeout: 5_000 });

    // Banner row shows the room code
    const row = banner.locator('ion-item');
    await expect(row).toContainText(code);

    // Tap banner → navigate back to /lobby/:code
    await row.evaluate((el: HTMLElement) => el.click());
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
    const code = await host.createSession();
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
    await backBtn.evaluate((el: HTMLElement) => el.click());

    // Soft exit → /lobby/:code (same code, NOT /home)
    await host.page.waitForURL(/\/lobby\//, { timeout: 10_000 });
    expect(host.page.url()).toBe(lobbyUrl);

    // Session alive: room code visible, host controls present
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
    await host.expectIsHost();

    // Participant count still 1 — session not torn down
    await host.expectParticipantCount(1);

    // No Jump-back-in banner visible (we are still in-session, not on home)
    const banner = host.page.locator('app-jump-back-in-banner');
    const bannerVisible = await banner.isVisible().catch(() => false);
    expect(bannerVisible).toBe(false);
  });
});
