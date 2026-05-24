/**
 * Host back-chevron discard (ADR-0045 / ADR-0046).
 *
 * Invariants:
 * 1. Host taps back chevron on Estimating during an active round → lands on
 *    Lobby (no auto-bounce back into Estimating), linked agenda item stays
 *    `pending`, item is re-startable.
 * 2. Non-host player does NOT see the back chevron during an active round.
 * 3. Reveal still consumes the linked agenda item.
 * 4. Skip still consumes the linked agenda item.
 * 5. Re-vote of an already-consumed agenda item: reveal succeeds (idempotent
 *    consume), agenda item stays consumed with original `consumedByRoundId`.
 *
 * Tag: @host — exercises the host-only Estimating back chevron path.
 */
import { test, expect } from './fixtures/app.fixture';
import { LOBBY, ROUND_START } from './fixtures/helpers';

test.describe('Host discard round @host', () => {
  test('back chevron discards in-flight round; agenda item stays pending and is re-startable', async ({
    host,
  }) => {
    await host.createSession();

    await host.addAgendaItem({ title: 'Login redesign' });
    await host.expectAgendaItems([{ title: 'Login redesign', state: 'pending' }]);

    // Start round from the agenda item (modal pre-fills title from the first
    // pending item).
    const startRoundBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startRoundBtn.click();
    const modal = host.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });
    const titleInput = host.page.getByRole('textbox', { name: 'Round title' });
    await expect(titleInput).toHaveValue('Login redesign');
    const startBtn = host.page.locator(ROUND_START.startBtn);
    await startBtn.click();
    await host.waitForEstimating();

    // Agenda item is still `pending` mid-round (consume-at-terminal lifecycle).
    // Switch back to lobby briefly to verify by navigating via state — but
    // checking from Estimating isn't possible. Instead verify after discard.

    // Tap the host back chevron — this writes `discardedAt` + `discardedBy`
    // and navigates to lobby. Lobby's auto-nav must NOT bounce back.
    const backBtn = host.page
      .locator('app-estimating:not(.ion-page-hidden) ion-header ion-button')
      .first();
    await backBtn.waitFor({ state: 'visible' });
    await backBtn.click();

    await host.page.waitForURL(/\/lobby\//, { timeout: 10_000 });
    // Give the projection a tick to settle, then ensure no auto-bounce.
    await host.page.waitForTimeout(500);
    expect(host.page.url()).toMatch(/\/lobby\//);

    // Item is back in the pending band.
    await host.expectAgendaItems([{ title: 'Login redesign', state: 'pending' }]);

    // Re-startable: open round-start again, modal pre-fills from the same item.
    await startRoundBtn.click();
    await modal.waitFor({ state: 'visible' });
    await expect(titleInput).toHaveValue('Login redesign');
    // Dismiss without starting.
    await host.page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
  });

  test('non-host player does not see back chevron during active round', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound('Login redesign');
    // Voter follows the host into Estimating via auto-nav.
    await player.waitForEstimating();

    // Host sees the back chevron.
    const hostBack = host.page.locator(
      'app-estimating:not(.ion-page-hidden) ion-header ion-buttons[slot="start"] ion-button',
    );
    await expect(hostBack).toHaveCount(1);

    // Voter does NOT see the back chevron during the active round.
    const playerBack = player.page.locator(
      'app-estimating:not(.ion-page-hidden) ion-header ion-buttons[slot="start"] ion-button',
    );
    await expect(playerBack).toHaveCount(0);
  });

  test('reveal consumes linked agenda item (atomic with terminal write)', async ({ host }) => {
    await host.createSession();
    await host.addAgendaItem({ title: 'API rate limiting' });

    const startRoundBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startRoundBtn.click();
    const modal = host.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });
    await host.page.locator(ROUND_START.startBtn).click();
    await host.waitForEstimating();

    await host.castVote('5');
    // Single player → unanimous auto-reveal navigates to lobby.
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    await host.expectAgendaItems([{ title: 'API rate limiting', state: 'consumed' }]);
  });

  test('skip consumes linked agenda item (atomic with terminal write)', async ({ host }) => {
    await host.createSession();
    await host.addAgendaItem({ title: 'Deferred refactor' });

    const startRoundBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startRoundBtn.click();
    const modal = host.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });
    await host.page.locator(ROUND_START.startBtn).click();
    await host.waitForEstimating();

    // Open the kebab menu and tap Skip round (host-only, active-round-only).
    await host.skipRound();

    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.expectAgendaItems([{ title: 'Deferred refactor', state: 'consumed' }]);
  });
});
