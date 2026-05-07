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
 *
 * ADR-0039 assertions (Scenarios 5–7):
 *
 *   Scenario 5 — ⋯ popover anchors near trigger (not at viewport bottom):
 *     The popover must appear in the top half of the viewport (y < 400 at
 *     1440×900). Any regression to bottom-sheet positioning would place the
 *     popover at y ≥ 700.  We also assert |popover.y − button.y| < 200 as a
 *     relative guard independent of viewport height.  Escape must dismiss.
 *
 *   Scenario 6 — Lobby section cards present at desktop (ADR-0039 §D3):
 *     Room card and Participants card always appear in the rail col. Results
 *     and History cards are gated on revealed rounds; this spec covers only
 *     the always-visible pair to avoid the additional setup cost of a full
 *     vote + reveal cycle.
 *
 *   Scenario 7 — Home single-column at 1440 (ADR-0039 §D4):
 *     Create Room and Join Room items must stack vertically (different y
 *     coordinates). If they were side-by-side their y values would match.
 */
import { test, expect } from './fixtures/app.fixture'
import { BASE_URL, ESTIMATING, HOME, LOBBY } from './fixtures/helpers'

test.describe('Desktop layout', () => {
  // Skip on any project whose viewport is narrower than 1024px.
  test.beforeEach(({ viewport }) => {
    test.skip(
      (viewport?.width ?? 1280) < 1024,
      'Desktop-layout spec only runs on ≥1024px viewports',
    )
  })

  // ---------------------------------------------------------------------------
  // Scenario 1 — Lobby two-pane shell structural presence and rail width
  //
  // Phase 3 (ADR-0039): .lobby-grid migrated from CSS grid to ion-grid.
  // CSS specificity bug fixed: ion-col size attrs removed; classes now win
  // because Ionic no longer sets inline styles.
  // ---------------------------------------------------------------------------
  test('Lobby two-pane grid renders at desktop width', async ({ host }) => {
    await host.createSession()

    const page = host.page

    // ion-grid.lobby-grid is the layout container. Verify it's in the DOM.
    const grid = page.locator('ion-grid.lobby-grid')
    await grid.waitFor({ state: 'attached' })

    // Rail col and pane col must be present.
    const railCol = page.locator('.lobby-rail-col')
    await railCol.waitFor({ state: 'attached' })
    const pane = page.locator('.lobby-pane')
    await pane.waitFor({ state: 'attached' })

    // Rail col width must be ~320px (±2px tolerance for sub-pixel rendering).
    const railBox = await railCol.boundingBox()
    expect(railBox).not.toBeNull()
    if (railBox) {
      expect(railBox.width).toBeGreaterThanOrEqual(318)
      expect(railBox.width).toBeLessThanOrEqual(322)
    }

    // Participant list lives inside the rail and must be visible.
    const participantList = page.locator('.lobby-rail ion-list.participants')
    await expect(participantList).toBeVisible()

    // Start Round button must be visible in the footer.
    const startBtn = page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn })
    await expect(startBtn).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Scenario 2 — Estimating 5-column card grid
  //
  // Phase 3 (ADR-0039): card grid migrated from `div.grid` (CSS grid) to
  // `ion-grid.grid` (flexbox). Five-column layout at ≥1024px is now achieved
  // via `.grid ion-col { flex: 0 0 20%; max-width: 20%; }` in the component
  // styles. CSS specificity bug fixed: ion-col size attrs removed; classes win.
  //
  // Fibonacci = ['0','1','2','3','5','8','13','21']. At 1280×900 with 5-col
  // layout: row 1 has 5 cards (0, 1, 2, 3, 5), row 2 has 3 cards (8, 13, 21).
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

    // Ordering invariant: all 8 cards visible before bounding-box reads so
    // the layout has fully stabilized after Yjs sync.
    const card0 = page.locator(ESTIMATING.card('0')).first()
    const card1 = page.locator(ESTIMATING.card('1')).first()
    const card2 = page.locator(ESTIMATING.card('2')).first()
    const card3 = page.locator(ESTIMATING.card('3')).first()
    const card5 = page.locator(ESTIMATING.card('5')).first()
    const card8 = page.locator(ESTIMATING.card('8')).first()
    const card13 = page.locator(ESTIMATING.card('13')).first()
    const card21 = page.locator(ESTIMATING.card('21')).first()

    const box0 = await card0.boundingBox()
    const box1 = await card1.boundingBox()
    const box2 = await card2.boundingBox()
    const box3 = await card3.boundingBox()
    const box5 = await card5.boundingBox()
    const box8 = await card8.boundingBox()
    const box13 = await card13.boundingBox()
    const box21 = await card21.boundingBox()

    expect(box0).not.toBeNull()
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    expect(box3).not.toBeNull()
    expect(box5).not.toBeNull()
    expect(box8).not.toBeNull()
    expect(box13).not.toBeNull()
    expect(box21).not.toBeNull()

    if (
      box0 &&
      box1 &&
      box2 &&
      box3 &&
      box5 &&
      box8 &&
      box13 &&
      box21
    ) {
      // Row 1: cards 0, 1, 2, 3, 5 must have the same y (±8px tolerance).
      expect(Math.abs(box0.y - box1.y)).toBeLessThan(8)
      expect(Math.abs(box0.y - box2.y)).toBeLessThan(8)
      expect(Math.abs(box0.y - box3.y)).toBeLessThan(8)
      expect(Math.abs(box0.y - box5.y)).toBeLessThan(8)

      // Row 2: cards 8, 13, 21 must have the same y (±8px tolerance)
      // and strictly greater than row 1.
      expect(Math.abs(box8.y - box13.y)).toBeLessThan(8)
      expect(Math.abs(box8.y - box21.y)).toBeLessThan(8)
      expect(box8.y).toBeGreaterThan(box0.y + 20)
    }
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

  // ---------------------------------------------------------------------------
  // Scenario 5 — ⋯ popover anchors near trigger, not at viewport bottom (ADR-0039 §D2)
  //
  // Pre-rework: ActionSheetController slid up from viewport bottom (~y≥700 at
  // 1440×900). Post-rework: ion-popover anchored to the click event — popover
  // top should be within 200px of the ⋯ button top.
  //
  // Threshold: popover.y < 400 guards against bottom-sheet regression at
  // 1440×900. Math.abs(popoverY - buttonY) < 200 is the relative guard.
  // ---------------------------------------------------------------------------
  test('⋯ popover anchors near trigger button, not at viewport bottom', async ({ host }) => {
    // Use a 1440×900 viewport per ADR-0039 §D2 specification.
    await host.page.setViewportSize({ width: 1440, height: 900 })
    await host.createSession()

    const page = host.page

    // Locate the ⋯ button. Scope to the active lobby's ion-header to avoid
    // matching a hidden page in Ionic's navigation stack.
    // getByRole pierces Ionic's shadow DOM and is more reliable than an
    // attribute selector + waitFor on the custom element host.
    const overflowBtn = page
      .locator('app-lobby:not(.ion-page-hidden) ion-header')
      .getByRole('button', { name: 'More options' })
    await overflowBtn.waitFor({ state: 'visible' })
    const btnBox = await overflowBtn.boundingBox()
    expect(btnBox).not.toBeNull()

    // Open the popover.
    await overflowBtn.click()

    // ion-popover must appear in the DOM and be visible.
    const popover = page.locator('ion-popover')
    await expect(popover).toBeVisible({ timeout: 5_000 })

    const popoverBox = await popover.boundingBox()
    expect(popoverBox).not.toBeNull()

    if (popoverBox && btnBox) {
      // Absolute guard: popover top must be in the top half of the viewport.
      // A bottom-sheet regression at 900px height lands at y ≥ 700.
      expect(popoverBox.y).toBeLessThan(400)

      // Relative guard: popover top within 200px of button top.
      expect(Math.abs(popoverBox.y - btnBox.y)).toBeLessThan(200)
    }

    // Escape must dismiss the popover.
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden({ timeout: 3_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 6 — Lobby page-section blocks present at desktop (ADR-0040 §D2)
  //
  // At 1440×900 the rail col always contains the Room section and the Participants
  // section. Results and History sections are gated on revealed rounds — covering them
  // would require a full vote+reveal cycle; skipped here with documentation.
  // ---------------------------------------------------------------------------
  test('Lobby rail sections (Room, Participants) render at desktop width', async ({ host }) => {
    await host.page.setViewportSize({ width: 1440, height: 900 })
    await host.createSession()

    const page = host.page

    // Two page-sections always render in the rail: Room (first) and Participants (second).
    // Select by class — native HTML section elements with page-section class.
    const sectionCards = page.locator('section.page-section')
    await expect(sectionCards).toHaveCount(2, { timeout: 10_000 })

    // Room card (first): contains the room-code heading.
    const roomCard = sectionCards.first()
    await expect(roomCard.locator('h1.room-code')).toBeVisible()

    // Participants card (second): contains the participant list.
    const participantsCard = sectionCards.nth(1)
    await expect(participantsCard.locator('ion-list.participants')).toBeVisible()

    // Results card and History card are gated on revealed rounds.
    // Coverage requires a vote + reveal cycle: skipped here; extend when a
    // lobby-with-results fixture is available.
  })

  // ---------------------------------------------------------------------------
  // Scenario 7 — Home stacks single-column at 1440 (ADR-0039 §D4)
  //
  // Phase 3 deleted the @media (min-width: 768px) 2-column rule on Home.
  // At 1440×900 Create Room and Join Room must stack vertically (differing y).
  // If side-by-side their bounding boxes would share the same y coordinate.
  // ---------------------------------------------------------------------------
  test('Home Create Room and Join Room stack vertically at 1440px', async ({ host }) => {
    await host.page.setViewportSize({ width: 1440, height: 900 })

    // Navigate to Home directly (no session needed).
    await host.page.goto(`${BASE_URL}/home`)
    await host.page.waitForURL(/\/(home|onboarding)/)
    if (host.page.url().includes('/onboarding')) {
      await host.onboard()
    }

    const createItem = host.page.locator(HOME.createCard)
    const joinItem = host.page.locator(HOME.joinCard)

    await expect(createItem).toBeVisible()
    await expect(joinItem).toBeVisible()

    const createBox = await createItem.boundingBox()
    const joinBox = await joinItem.boundingBox()

    expect(createBox).not.toBeNull()
    expect(joinBox).not.toBeNull()

    if (createBox && joinBox) {
      // Vertical stacking: Join Row must be below Create Room row.
      // If they were side-by-side, joinBox.y ≈ createBox.y (within 1px).
      // Vertically stacked items differ by at least one item height (≥ 44px).
      expect(joinBox.y).toBeGreaterThan(createBox.y + 20)
    }
  })
})
