/**
 * Agenda e2e specs (ADR-0042).
 *
 * Covers:
 * 1. Single-host flow: add items, round pre-fill, consume, skip
 * 2. Multi-client visibility: joiner sees list, no edit controls, "Next" badge
 * 3. Re-vote preserves agendaItemId
 * 4. Host handoff preserves agenda edit ability
 */

import { test, expect } from './fixtures/app.fixture';
import {
  BASE_URL,
  ESTIMATING,
  HOME,
  LOBBY,
  ROUND_FIELD,
  ROUND_START,
  fillRoomCode,
} from './fixtures/helpers';

// ---------------------------------------------------------------------------
// 1. Single-host flow
// ---------------------------------------------------------------------------

test.describe('Agenda single-host flow', () => {
  test('add items, start rounds, consume + skip → correct final states', async ({ host }) => {
    // Setup: create session (the agenda is on the lobby, fully in view)
    await host.createSession();

    // Add 3 items: title-only, ticketId-only, both
    await host.addAgendaItem({ title: 'Login redesign' });
    await host.addAgendaItem({ ticketId: 'PROJ-42' });
    await host.addAgendaItem({ title: 'API rate limiting', ticketId: 'PROJ-99' });

    // Verify 3 pending items visible.
    // Note: ion-badge.ticket-badge only shows when both title AND ticketId are set.
    // For ticketId-only items, the ticketId is shown as the item title.
    await host.expectAgendaItems([
      { title: 'Login redesign' },
      { title: 'PROJ-42' }, // ticketId shown as title when no title set
      { title: 'API rate limiting' }, // title shown; badge for ticketId shown separately
    ]);

    // Start Round 1 — modal should pre-fill from item 1
    const startRoundBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startRoundBtn.waitFor({ state: 'visible' });
    await startRoundBtn.click();

    const modal = host.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });

    // Title field should be pre-filled with item 1's title.
    // getByRole pierces ion-input shadow DOM to find the native input.
    const titleInput = host.page.getByRole('textbox', { name: ROUND_FIELD.title });
    await expect(titleInput).toHaveValue('Login redesign');

    // Cancel modal — state should be unchanged.
    // Press Escape to dismiss the ion-modal (Ionic handles keyboard dismiss natively;
    // this avoids Angular CD timing issues with evaluate(el.click()) on ion-button).
    await host.page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });

    // Re-open — still pre-fills from item 1
    await startRoundBtn.waitFor({ state: 'visible' });
    await startRoundBtn.click();
    await modal.waitFor({ state: 'visible' });
    await expect(titleInput).toHaveValue('Login redesign');

    // Confirm round — item 1 consumed.
    // Use :has-text() pattern from ROUND_START.startBtn (known working in other fixtures).
    // ion-button[aria-label] CSS selectors don't match Ionic web component hosts reliably.
    const startBtn = host.page.locator(ROUND_START.startBtn);
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();
    await host.waitForEstimating();

    // Vote and reveal
    await host.castVote('5');
    // Single voter → auto-reveal
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Item 1 should now be consumed, items 2+3 still pending
    await host.expectAgendaItems([
      { title: 'Login redesign', state: 'consumed' },
      { title: 'PROJ-42' },
      { title: 'API rate limiting' },
    ]);

    // Start Next Round — pre-fills from item 2 (ticketId-only)
    const nextRoundBtn = host.page.locator('ion-button').filter({ hasText: LOBBY.nextRoundBtn });
    await nextRoundBtn.click();
    const modal2 = host.page.locator('app-round-start-sheet');
    await modal2.waitFor({ state: 'visible' });
    const ticketInput = host.page.getByRole('textbox', { name: ROUND_FIELD.ticketId });
    await expect(ticketInput).toHaveValue('PROJ-42');

    // Confirm round 2 — same :has-text() pattern as round 1
    const startBtn2 = host.page.locator(ROUND_START.startBtn);
    await startBtn2.waitFor({ state: 'visible' });
    await startBtn2.click();
    await host.waitForEstimating();

    // Vote and auto-reveal
    await host.castVote('3');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Skip item 3 from agenda (no round)
    await host.skipAgendaItem(2);

    // Final state: 2 consumed, 1 skipped, 0 pending
    // (item indices shift after consumed items collapse visibility)
    const agendaList = host.page.locator('app-agenda-panel ion-list.agenda-list');
    await agendaList.waitFor({ state: 'visible' });
    const allItems = agendaList.locator('ion-item.agenda-item');
    // All 3 should appear (consumed shown, skipped shown, no pending)
    await expect(allItems).toHaveCount(3);

    // Verify no pending items remain in the panel (no add-visible pending dot)
    const pendingItems = agendaList.locator(
      'ion-item.agenda-item:not(.agenda-item--consumed):not(.agenda-item--skipped):not(.agenda-item--cancelled)',
    );
    await expect(pendingItems).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Multi-client agenda visibility
// ---------------------------------------------------------------------------

test.describe('Agenda multi-client visibility', () => {
  test('joiner sees full list; no edit controls; "Next" badge on mobile', async ({ host }) => {
    // Host (desktop) adds 3 items
    await host.createSession();
    await host.addAgendaItem({ title: 'Story Alpha' });
    await host.addAgendaItem({ title: 'Story Beta', ticketId: 'BETA-1' });
    await host.addAgendaItem({ ticketId: 'GAMMA-9' });

    const code = await host.page.locator('button.room-code span').textContent();
    const roomCode = (code ?? '').replaceAll(/[^A-Z0-9]/gi, '');

    // Joiner on mobile-sized viewport
    const joinerCtx = await host.page
      .context()
      .browser()!
      .newContext({
        viewport: { width: 375, height: 812 },
      });
    const joinerPage = await joinerCtx.newPage();

    try {
      // Onboard and join
      await joinerPage.goto(`${BASE_URL}/home`);
      await joinerPage.waitForURL(/\/(home|onboarding)/);
      if (joinerPage.url().includes('/onboarding')) {
        await joinerPage
          .locator('ion-input[autocapitalize="words"]')
          .locator('input')
          .fill('Joiner');
        await joinerPage.locator('ion-button:has-text("Continue")').click();
        await joinerPage.waitForURL(/\/home/);
      }
      await joinerPage.locator(HOME.joinCard).click();
      await joinerPage.waitForURL(/\/join/);
      // The sixth character submits.
      await fillRoomCode(joinerPage, roomCode);
      await joinerPage.waitForURL(/\/lobby/);

      // The whole list is on the page — nothing to expand, on a phone either
      const items = joinerPage.locator(
        'app-agenda-panel ion-list.agenda-list ion-item.agenda-item',
      );
      await expect(items).toHaveCount(3);

      // The story a round picks up next carries the "Next" badge, and only it
      const next = joinerPage.locator('app-agenda-panel ion-item.agenda-item:has(.next-badge)');
      await expect(next).toHaveCount(1);
      await expect(next.locator('span.item-title')).toContainText('Story Alpha');

      // Joiner has NO edit controls: no row menus, no "Add story"
      await expect(joinerPage.locator('app-agenda-panel ion-button.item-menu-btn')).toHaveCount(0);
      await expect(joinerPage.locator('app-agenda-panel ion-button.add-btn')).toHaveCount(0);
      // ...and the host has one menu per pending story
      await expect(host.page.locator('app-agenda-panel ion-button.item-menu-btn')).toHaveCount(3);

      // Host removes item 2 — joiner sees it disappear (removed hidden by default)
      await host.cancelAgendaItem(1);

      // Wait for Yjs sync: joiner list shrinks to 2 visible items
      // (removed item hidden unless "Show removed" toggled)
      await expect(items).toHaveCount(2, { timeout: 8_000 });

      // Anyone can look at what was removed
      await joinerPage.locator('app-agenda-panel ion-button.show-cancelled-btn').click();
      await expect(items).toHaveCount(3);
      await expect(items.nth(1)).toHaveClass(/agenda-item--cancelled/);
    } finally {
      await joinerCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 2b. Ordering and editing — the rest of the row menu
// ---------------------------------------------------------------------------

test.describe('Agenda ordering and editing', () => {
  test('stories move up and down, and the next round follows the order', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.addAgendaItem({ title: 'Alpha' });
    await host.addAgendaItem({ title: 'Beta' });
    await host.addAgendaItem({ title: 'Gamma' });
    await host.expectNextAgendaItem('Alpha');

    await host.reorderAgendaItem(1, 'up');
    await host.expectAgendaItems([{ title: 'Beta' }, { title: 'Alpha' }, { title: 'Gamma' }]);
    await host.expectNextAgendaItem('Beta');
    // The same order for everyone
    await player.expectAgendaItems([{ title: 'Beta' }, { title: 'Alpha' }, { title: 'Gamma' }]);
    await player.expectNextAgendaItem('Beta');

    await host.reorderAgendaItem(1, 'down');
    await host.expectAgendaItems([{ title: 'Beta' }, { title: 'Gamma' }, { title: 'Alpha' }]);
    await player.expectAgendaItems([{ title: 'Beta' }, { title: 'Gamma' }, { title: 'Alpha' }]);

    // The round picks up whatever is first now
    await host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn })
      .click();
    await host.page.locator('app-round-start-sheet').waitFor({ state: 'visible' });
    await expect(host.page.getByRole('textbox', { name: ROUND_FIELD.title })).toHaveValue('Beta');
  });

  test('the menu offers no move that goes nowhere', async ({ host }) => {
    await host.createSession();
    await host.addAgendaItem({ title: 'Alpha' });
    await host.addAgendaItem({ title: 'Beta' });

    const menuOf = (index: number) =>
      host.page
        .locator('app-lobby:not(.ion-page-hidden) app-agenda-panel ion-item.agenda-item')
        .nth(index)
        .locator('ion-button.item-menu-btn');
    const menu = host.page.locator('ion-popover, ion-action-sheet').first();
    const option = (name: string) => menu.getByRole('button', { name, exact: true });
    const close = async () => {
      await menu.evaluate((el: HTMLElement & { dismiss?: () => Promise<boolean> }) =>
        el.dismiss?.(),
      );
      await menu.waitFor({ state: 'hidden', timeout: 5_000 });
    };

    await menuOf(0).click();
    await menu.waitFor({ state: 'visible' });
    await expect(option('Move down')).toHaveCount(1);
    await expect(option('Move up')).toHaveCount(0);
    await close();

    await menuOf(1).click();
    await menu.waitFor({ state: 'visible' });
    await expect(option('Move up')).toHaveCount(1);
    await expect(option('Move down')).toHaveCount(0);
    await close();
  });

  test('an edited story reads the same for everyone, and in the round it starts', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.addAgendaItem({ title: 'Alpha' });
    await host.addAgendaItem({ title: 'Beta' });

    await host.editAgendaItem(0, { title: 'Alpha, revised', ticketId: 'ALPHA-1' });

    const edited = [{ title: 'Alpha, revised', ticketId: 'ALPHA-1' }, { title: 'Beta' }];
    await host.expectAgendaItems(edited);
    await player.expectAgendaItems(edited);

    await host.startRound();
    await player.waitForEstimating();
    await expect(player.page.locator(ESTIMATING.descriptor)).toHaveText('Alpha, revised');
  });
});

// ---------------------------------------------------------------------------
// 3. Re-vote preserves agendaItemId
// ---------------------------------------------------------------------------

test.describe('Agenda re-vote linkage', () => {
  /**
   * Ordering invariant: host starts round with agenda item → reveals →
   * re-votes → second round must carry same agendaItemId as first.
   * Item state stays 'consumed' (single consumption, not duplicated).
   */
  test('re-vote second round carries same agendaItemId; item stays consumed', async ({ host }) => {
    await host.createSession();
    await host.addAgendaItem({ title: 'Auth service', ticketId: 'AUTH-1' });

    // Start round (consumes item via pre-fill from agenda item)
    const startRoundBtn = host.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startRoundBtn.waitFor({ state: 'visible' });
    await startRoundBtn.click();
    const modal = host.page.locator('app-round-start-sheet');
    await modal.waitFor({ state: 'visible' });
    // Verify pre-fill before submitting — round must carry title for re-vote inheritance.
    const titleField = host.page.getByRole('textbox', { name: ROUND_FIELD.title });
    await expect(titleField).toHaveValue('Auth service');
    const startBtn = host.page.locator(ROUND_START.startBtn);
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();
    await host.waitForEstimating();

    // Vote and reveal manually (host only, so auto-reveal)
    await host.castVote('5');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Item should be consumed
    await host.expectAgendaItems([{ title: 'Auth service', state: 'consumed' }]);

    // Re-vote
    await host.revote();

    // Second round's estimating page should show same title in descriptor (inherited from parent).
    // The toolbar says "Round N"; the round's title field is the heading under it.
    await expect(host.page.locator(ESTIMATING.roundTitle)).toHaveText('Round 2');
    await expect(host.page.locator(ESTIMATING.descriptor)).toContainText('Auth service');

    // Vote and auto-reveal
    await host.castVote('8');
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 });

    // Item still consumed (not re-consumed; only 1 item)
    await host.expectAgendaItems([{ title: 'Auth service', state: 'consumed' }]);

    // Round history: both rounds visible with agenda-derived label
    const history = host.page.locator('app-round-history');
    await history.waitFor({ state: 'visible', timeout: 5_000 });
    // Both rounds should display "Auth service" as their label (from agendaItemId fallback)
    const historyLabels = history.locator('span, p');
    const texts = await historyLabels.allTextContents();
    const hasAgendaLabel = texts.some((t) => t.includes('Auth service'));
    expect(hasAgendaLabel).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Host handoff preserves agenda edit ability
// ---------------------------------------------------------------------------

test.describe('Agenda host handoff', () => {
  /**
   * Ordering invariant (ADR-0010): host drops → 5s debounce → lowest-peer-ID
   * election. After election, new host must be able to add/edit/skip/cancel
   * agenda items. Pre-existing agenda content must be preserved.
   *
   * Test uses a 7s wait after disconnect to clear the debounce reliably.
   */
  test('new host after election can edit agenda', async ({ host, player }) => {
    const code = await host.createSession();

    // Add 2 items before joiner joins
    await host.addAgendaItem({ title: 'Item One' });
    await host.addAgendaItem({ title: 'Item Two' });

    await player.joinSession(code);
    await host.expectParticipantCount(2);

    const playerItems = player.page.locator(
      'app-agenda-panel ion-list.agenda-list ion-item.agenda-item',
    );
    await expect(playerItems).toHaveCount(2, { timeout: 8_000 });

    // Host leaves — triggers election after 5s debounce (ADR-0010)
    await host.page.close();

    // Wait for election to complete (debounce 5s + relay sync margin)
    // Ordering invariant: we wait 7s to ensure debounce has elapsed before
    // asserting that player gained host controls.
    await player.page.waitForTimeout(7_000);

    // New host (player) should see host controls
    await player.expectIsHost();

    // Agenda content preserved
    await player.expectAgendaItems([{ title: 'Item One' }, { title: 'Item Two' }]);

    // New host can add an item
    await player.addAgendaItem({ title: 'Item Three' });
    await player.expectAgendaItems([
      { title: 'Item One' },
      { title: 'Item Two' },
      { title: 'Item Three' },
    ]);

    // New host can skip an item
    await player.skipAgendaItem(1);
    await player.expectAgendaItems([
      { title: 'Item One' },
      { title: 'Item Two', state: 'skipped' },
      { title: 'Item Three' },
    ]);
  });
});
