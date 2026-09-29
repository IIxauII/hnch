import { test, expect } from './fixtures/app.fixture';
import { LOBBY, ESTIMATING, KICK_AFFORDANCE, expectToast } from './fixtures/helpers';

test.describe('Auto-reconnect after transient disconnect', () => {
  test('reconnecting toast appears while host is offline and clears on reconnect', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);

    // Go offline — simulate transient network drop
    await host.page.context().setOffline(true);

    // The banner appears as soon as a connection that was up is known to be
    // down: it is wired to docService.reconnecting(), with no delay.
    await expect(
      host.page.locator('app-lobby:not(.ion-page-hidden) [data-testid="connection-status-banner"]'),
    ).toBeVisible({ timeout: 5_000 });

    // Come back online
    await host.page.context().setOffline(false);

    // Banner should disappear once reconnected
    await host.page
      .locator('app-lobby:not(.ion-page-hidden) [data-testid="connection-status-banner"]')
      .waitFor({ state: 'hidden', timeout: 15_000 });

    // Success toast should appear briefly
    await expectToast(host.page, 'Reconnected', { timeout: 5_000 });

    // Success toast should auto-dismiss within ~2s
    await host.page
      .locator('ion-toast[message="Reconnected"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 });

    // Still on lobby, room code still visible
    await host.page.waitForURL(/\/lobby/);
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
  });

  test('after reconnect, session state (participants + scale) is preserved', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);
    await host.expectParticipantCount(2);

    // Drop network
    await host.page.context().setOffline(true);
    await host.page.waitForTimeout(1_000);

    // Restore network
    await host.page.context().setOffline(false);

    // Wait for reconnect (room code remains visible = sync restored)
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible({ timeout: 15_000 });

    // Session state preserved: both participants still listed
    await host.expectParticipantCount(2);
    // Scale subtitle still shows Fibonacci
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('Fibonacci');
  });

  /**
   * Presence comes back with the connection. It used to lag a reconnect by up
   * to 15 s — until the next awareness renewal — on both sides: the one who
   * had been away saw an empty room, and the room saw them gone for long
   * enough to elect another host (ADR-0010, 5 s debounce).
   *
   * Ordering: both in → host offline for 1 s (well under the debounce) →
   * back online → within a few seconds each sees the other as online, and
   * after more than a debounce the host is still the host.
   */
  test('a short drop costs nobody their presence, and the host keeps the room', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);

    const banner = host.page.locator(
      'app-lobby:not(.ion-page-hidden) [data-testid="connection-status-banner"]',
    );
    const hostRowOnPlayer = player.page.locator(KICK_AFFORDANCE.row('Host'));
    const playerRowOnHost = host.page.locator(KICK_AFFORDANCE.row('Player'));

    await host.page.context().setOffline(true);
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await host.page.waitForTimeout(1_000);
    await host.page.context().setOffline(false);
    await banner.waitFor({ state: 'hidden', timeout: 15_000 });

    // Both directions, promptly
    await expect(playerRowOnHost.locator('ion-note')).toHaveCount(0, { timeout: 4_000 });
    await expect(hostRowOnPlayer.locator('ion-note')).toHaveCount(0, { timeout: 4_000 });

    // Past one election debounce, nothing has changed hands — and nothing
    // did on the way there. Looked at once a second, not waited for: a
    // retrying assertion would sit through a handover that is handed back.
    for (let i = 0; i < 6; i++) {
      await host.page.waitForTimeout(1_000);
      expect(await hostRowOnPlayer.locator(LOBBY.hostIcon).count(), `second ${i + 1}`).toBe(1);
      expect(await playerRowOnHost.locator(LOBBY.hostIcon).count(), `second ${i + 1}`).toBe(0);
      expect(await playerRowOnHost.locator('ion-note').count(), `second ${i + 1}`).toBe(0);
    }
    await host.expectIsHost();
  });

  test('joiner reconnects mid-session via close+rejoin and sees current round', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Host starts a round
    await host.startRound();
    await player.waitForEstimating();

    // Player disconnects (full page close) — no votes cast so unanimous
    // auto-reveal does not fire; round stays active for rejoiner to land on.
    await player.disconnect();

    // Brief pause for relay to process disconnect
    await host.page.waitForTimeout(1_500);

    // Player reconnects using same room code
    await player.reconnect(code);

    // Player should land on /estimating (active round exists)
    await player.page.waitForURL(/\/estimating/, { timeout: 10_000 });

    // Card grid is visible — round state rehydrated
    await expect(player.page.locator(ESTIMATING.cardGrid)).toBeVisible();
  });

  test('host reconnects after going offline and comes back to lobby', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.page.waitForURL(/\/lobby/);
    await player.page.waitForURL(/\/lobby/);

    // Host goes offline briefly
    await host.page.context().setOffline(true);
    await host.page.waitForTimeout(500);
    await host.page.context().setOffline(false);

    // Host stays on lobby and room code is still visible
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible({ timeout: 10_000 });

    // Host still has start-round controls
    await expect(host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('reconnecting toast shows during estimating and clears on reconnect', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();

    // Player goes offline while on estimating
    await player.page.context().setOffline(true);

    await expect(
      player.page.locator(
        'app-estimating:not(.ion-page-hidden) [data-testid="connection-status-banner"]',
      ),
    ).toBeVisible({ timeout: 5_000 });

    // Player comes back online
    await player.page.context().setOffline(false);

    // Banner dismisses
    await player.page
      .locator('app-estimating:not(.ion-page-hidden) [data-testid="connection-status-banner"]')
      .waitFor({ state: 'hidden', timeout: 15_000 });

    // Success toast appears
    await expectToast(player.page, 'Reconnected', { timeout: 5_000 });

    // Still on estimating, card grid intact
    await player.page.waitForURL(/\/estimating/);
    await expect(player.page.locator(ESTIMATING.cardGrid)).toBeVisible();
  });
});
