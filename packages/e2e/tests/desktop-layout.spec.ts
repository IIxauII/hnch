/**
 * desktop-layout.spec.ts — Desktop-specific layout and keyboard-shortcut assertions.
 *
 * All three existing Playwright projects use Desktop Chrome/Safari/Firefox at
 * 1280×720 (≥1024px), so these tests run on every project without a separate
 * viewport project. The guard below skips if a mobile-viewport project is
 * added in the future.
 *
 * Ordering invariant for Scenario 3 (keyboard vote + Esc):
 *   Key press fires AFTER Angular's change-detection stabilises the card grid.
 *   We wait for all 8 Fibonacci cards to be visible before pressing keys so the
 *   shortcut handler can read `currentRound()?.scale.cards` without racing the
 *   initial Yjs sync.
 *
 * Ordering invariant for Scenario 4 (keyboard reveal):
 *   The host presses `r` after casting a vote. We confirm at least one `.voted`
 *   dot is present before pressing `r` — this ensures the CRDT has written the
 *   vote so the reveal is not a no-op.
 */
import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING, LOBBY } from './fixtures/helpers'

test.describe('Desktop layout', () => {
  // Skip on any project whose viewport is narrower than 1024px.
  test.beforeEach(({ viewport }) => {
    test.skip(
      (viewport?.width ?? 1280) < 1024,
      'Desktop-layout spec only runs on ≥1024px viewports',
    )
  })

  // ---------------------------------------------------------------------------
  // Scenario 1 — Lobby two-pane shell visible
  // ---------------------------------------------------------------------------
  test('Lobby two-pane grid renders at desktop width', async ({ host }) => {
    await host.createSession()

    const page = host.page

    // Verify .lobby-grid has display:grid (set by the ≥1024px media query).
    const grid = page.locator('.lobby-grid')
    await grid.waitFor({ state: 'visible' })
    const display = await grid.evaluate(
      (el: HTMLElement) => getComputedStyle(el).display,
    )
    expect(display).toBe('grid')

    // Rail must be visible (it contains participant list — always has content).
    const rail = page.locator('.lobby-rail')
    await expect(rail).toBeVisible()

    // Pane may be empty (no revealed round) — check it's in the DOM and the
    // grid-template-columns confirms two columns are laid out.
    const pane = page.locator('.lobby-pane')
    await pane.waitFor({ state: 'attached' })
    const cols = await grid.evaluate(
      (el: HTMLElement) => getComputedStyle(el).gridTemplateColumns,
    )
    // Two columns: "320px Xpx" (rail-width + remainder). At least 2 tokens.
    const colCount = cols.trim().split(/\s+/).length
    expect(colCount).toBe(2)

    // Participant list lives inside the rail.
    const participantList = rail.locator('ion-list.participants')
    await expect(participantList).toBeVisible()

    // Footer Start-Round button left-edge aligns with the right pane.
    // At ≥1024px the footer content gets margin-inline-start = rail-width + gap.
    // We allow ±16px slack for Ionic toolbar padding variance.
    const startBtn = page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn })
    await startBtn.waitFor({ state: 'visible' })

    const railBox = await rail.boundingBox()
    const btnBox = await startBtn.boundingBox()

    expect(railBox).not.toBeNull()
    expect(btnBox).not.toBeNull()
    if (railBox && btnBox) {
      // Button must start to the right of the rail's right edge.
      expect(btnBox.x).toBeGreaterThan(railBox.x + railBox.width - 16)
    }
  })

  // ---------------------------------------------------------------------------
  // Scenario 2 — Estimating 5-column card grid
  // ---------------------------------------------------------------------------
  test('Estimating grid has 5 columns and all 8 Fibonacci cards visible', async ({
    host,
    player,
    createParticipant,
  }) => {
    // Third participant keeps unanimous auto-reveal from firing during assertions.
    const spectator = await createParticipant('Spectator')

    const code = await host.createSession()
    await player.joinSession(code)
    await spectator.joinSession(code)

    await host.startRound()
    await player.waitForEstimating()
    await spectator.waitForEstimating()

    const page = host.page

    // Wait for all 8 Fibonacci cards to render.
    // Fibonacci = ['0','1','2','3','5','8','13','21']
    const fibCards = ['0', '1', '2', '3', '5', '8', '13', '21']
    for (const value of fibCards) {
      await expect(page.locator(ESTIMATING.card(value)).first()).toBeVisible()
    }

    // Assert 5-column grid via computed grid-template-columns.
    // Resolved value is "Xpx Xpx Xpx Xpx Xpx" (5 tokens) at ≥1024px.
    const gridEl = page.locator(ESTIMATING.cardGrid)
    await gridEl.waitFor({ state: 'visible' })
    const cols = await gridEl.evaluate(
      (el: HTMLElement) => getComputedStyle(el).gridTemplateColumns,
    )
    // Count space-separated tokens — each resolved column is a pixel value.
    const colCount = cols.trim().split(/\s+/).length
    expect(colCount).toBe(5)
  })

  // ---------------------------------------------------------------------------
  // Scenario 3 — Keyboard vote (digit key) and Escape to clear
  //
  // Ordering invariant: all cards visible before key press → shortcut handler
  // reads scale.cards without racing Yjs sync.
  // ---------------------------------------------------------------------------
  test('Keyboard shortcut: digit key votes, Escape clears', async ({
    host,
    player,
    createParticipant,
  }) => {
    const spectator = await createParticipant('Spectator')

    const code = await host.createSession()
    await player.joinSession(code)
    await spectator.joinSession(code)

    await host.startRound()
    await player.waitForEstimating()
    await spectator.waitForEstimating()

    const page = host.page

    // Wait for all Fibonacci cards to be visible so the keyboard handler
    // can resolve cards by position without racing Yjs sync.
    for (const v of ['0', '1', '2', '3', '5', '8', '13', '21']) {
      await expect(page.locator(ESTIMATING.card(v)).first()).toBeVisible()
    }

    // Wait for any lingering modal state to clear. KeyboardShortcutService
    // silently swallows all key events while isAnyModalOpen() returns true.
    // isAnyModalOpen() checks both body.modal-open AND ion-modal.show-modal.
    await page.waitForFunction(
      () =>
        !document.body.classList.contains('modal-open') &&
        document.querySelector('ion-modal.show-modal') === null,
    )

    // Focus the Reveal Votes button to give CDP keyboard events a Zone.js-
    // patched native dispatch target. ion-button is focusable and non-editable
    // per KeyboardShortcutService's isEditableTarget check.
    await page.locator(ESTIMATING.revealBtn).focus()

    // Press '5' → votes the card at position 5 (1-indexed).
    // Fibonacci = ['0','1','2','3','5','8','13','21'], index 4 = '5'.
    await page.keyboard.press('5')

    // Wait for the voted dot to confirm the vote registered in the Yjs doc.
    const votedDots = page.locator(ESTIMATING.votedDots)
    await expect(votedDots.first()).toBeVisible()

    // Card at position 5 (value '5') must gain the .selected class.
    const card5 = page.locator(ESTIMATING.card('5')).first()
    await expect(card5).toHaveClass(/selected/)

    // Press Escape → clears selection (onCardTap toggles the current vote off).
    await page.keyboard.press('Escape')

    // No card should retain .selected.
    await expect(page.locator(ESTIMATING.selectedCard)).toHaveCount(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario 4 — Keyboard reveal (`r` key, host only)
  //
  // Ordering invariant: host waits for own `.voted` dot before pressing `r` so
  // the CRDT vote write has propagated and the reveal is not a no-op.
  // ---------------------------------------------------------------------------
  test('Keyboard shortcut: r key reveals (host only)', async ({ host }) => {
    await host.createSession()
    await host.startRound()

    const page = host.page

    // Wait for card grid to be ready.
    await expect(page.locator(ESTIMATING.card('5')).first()).toBeVisible()

    // Cast a vote via keyboard (position 4 → Fibonacci['3']).
    // Alternatively, click a card directly for reliability.
    await host.castVote('5')

    // Wait for the host's own voted dot before pressing r.
    const votedDots = page.locator(ESTIMATING.votedDots)
    await expect(votedDots.first()).toBeVisible()

    // Ensure document-level keyboard focus for the KeyboardShortcutService listener.
    // Wait for any lingering modal state before pressing keyboard shortcuts.
    await page.waitForFunction(
      () =>
        !document.body.classList.contains('modal-open') &&
        document.querySelector('ion-modal.show-modal') === null,
    )

    // Focus the Reveal Votes button and press `r`.
    await page.locator(ESTIMATING.revealBtn).focus()
    await page.keyboard.press('r')

    // After reveal the app navigates to /lobby.
    await page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Results section must appear confirming reveal succeeded.
    await expect(page.locator(LOBBY.resultsSection)).toBeVisible({ timeout: 5_000 })
  })
})
