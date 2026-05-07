import { test as base, type BrowserContext, type Page } from '@playwright/test'
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  SETTINGS_SHEET,
  SCALE_PICKER,
  ACCESS_PICKER,
  APP_SETTINGS,
  APP_SETTINGS_SCALE_PICKER,
  PRESET_CARD_EDITOR,
  fillRoomCode,
} from './helpers'

// ---------------------------------------------------------------------------
// Scale label normalization
// ---------------------------------------------------------------------------

// Maps caller-provided scale names to the exact text rendered by formatScaleId()
// in the scale-picker template. Angular [value] bindings set DOM properties,
// not HTML attributes, so selectors must match by visible text instead.
const SCALE_DISPLAY_LABELS: Record<string, string> = {
  'fibonacci': 'Fibonacci',
  'Fibonacci': 'Fibonacci',
  't-shirt': 'T-shirt',
  'T-Shirt': 'T-shirt',
  'T-shirt': 'T-shirt',
  'powers-of-2': 'Powers of 2',
  'Powers of 2': 'Powers of 2',
  'linear': 'Linear (1\u201310)',
  'Linear': 'Linear (1\u201310)',
  'risk': 'Risk',
  'Risk': 'Risk',
}

function resolveScaleDisplayLabel(label: string): string {
  return SCALE_DISPLAY_LABELS[label] ?? label
}

// ---------------------------------------------------------------------------
// Participant — page-object wrapper around a single browser context
// ---------------------------------------------------------------------------

export class Participant {
  constructor(
    private context: BrowserContext,
    public page: Page,
    private readonly displayName: string,
  ) {}

  // -- Onboarding -----------------------------------------------------------

  /** Complete the onboarding flow by entering a display name. */
  async onboard(): Promise<void> {
    await this.page.waitForURL(/\/onboarding/)
    const input = this.page.locator(ONBOARDING.nameInput)
    // Ionic wraps <input> inside shadow DOM of ion-input.
    // Use .fill() which works through shadow DOM in Playwright.
    await input.locator('input').fill(this.displayName)
    await this.page.locator(ONBOARDING.continueBtn).click()
    await this.page.waitForURL(/\/home/)
  }

  // -- Session lifecycle ----------------------------------------------------

  /** Create a new session from /home. Returns the room code. */
  async createSession(): Promise<string> {
    await this.page.goto(`${BASE_URL}/home`)
    await this.page.waitForURL(/\/(home|onboarding)/)
    if (this.page.url().includes('/onboarding')) {
      await this.onboard()
    }
    await this.page.locator(HOME.createCard).click()
    await this.page.waitForURL(/\/lobby/)
    const codeEl = this.page.locator(LOBBY.roomCode)
    await codeEl.waitFor({ state: 'visible' })
    const code = await codeEl.textContent()
    if (!code) throw new Error('Room code not found on lobby page')
    return code.replace(/[^A-Z0-9]/gi, '') // strip dash formatting
  }

  /** Join an existing session from /home using a room code. */
  async joinSession(code: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/home`)
    await this.page.waitForURL(/\/(home|onboarding)/)
    if (this.page.url().includes('/onboarding')) {
      await this.onboard()
    }
    await this.page.locator(HOME.joinCard).click()
    await this.page.waitForURL(/\/join/)
    await fillRoomCode(this.page, code)
    await this.page.locator(JOIN.joinBtn).click()
    await this.page.waitForURL(/\/lobby/)
  }

  // -- Lobby actions --------------------------------------------------------

  /** Tap "Start Round N" and confirm the modal. */
  async startRound(title?: string): Promise<void> {
    // Scope to the active Ionic page so a hidden /join in the navigation
    // stack can't intercept the click via pointer-event bubbling.
    const startRoundBtn = this.page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn })
    await startRoundBtn.waitFor({ state: 'visible' })
    await startRoundBtn.evaluate((el: HTMLElement) => el.click())
    // At ≥1024px Ionic renders modals as centered dialogs (no sheet breakpoints,
    // ADR-0038). The inner app-round-start-sheet.ion-page is attached to the DOM
    // but Ionic keeps it at opacity:0 / visibility:hidden during the modal
    // lifecycle — `state:'visible'` is never satisfied at desktop. Use
    // `state:'attached'` so the wait passes on both mobile and desktop.
    const modal = this.page.locator('app-round-start-sheet')
    await modal.waitFor({ state: 'attached' })
    if (title) {
      await modal.locator('ion-input').locator('input').fill(title)
    }
    const startBtn = this.page.locator(ROUND_START.startBtn)
    await startBtn.waitFor({ state: 'attached' })
    await startBtn.evaluate((el: HTMLElement) => el.click())
    await this.page.waitForURL(/\/estimating/)
  }

  /** Wait for auto-navigation to /estimating (non-host clients). */
  async waitForEstimating(): Promise<void> {
    await this.page.waitForURL(/\/estimating/, { timeout: 10_000 })
  }

  // -- Voting ---------------------------------------------------------------

  /** Tap a card to cast (or change) a vote. */
  async castVote(value: string): Promise<void> {
    await this.page.locator(ESTIMATING.card(value)).first().click()
  }

  /** Toggle role between voter and viewer on the estimating page. */
  async toggleRole(): Promise<void> {
    // Chip shows either "Voter" or "Observing" text — use evaluate to force click
    // .first() ensures we target the active (topmost) app-estimating page in the Ionic stack
    const chip = this.page
      .locator(ESTIMATING.roleChip)
      .filter({ hasText: /Voter|Observing/ })
      .first()
    await chip.waitFor({ state: 'visible' })
    await chip.evaluate((el: HTMLElement) => el.click())
  }

  /** Tap the Reveal Votes button (host only). Navigates to /lobby with results. */
  async reveal(): Promise<void> {
    await this.page
      .locator(ESTIMATING.revealBtn)
      .evaluate((el: HTMLElement) => el.click())
    await this.page.waitForURL(/\/lobby/)
    // Wait for results section to render (ensures lastRevealedRound() signal is computed)
    // so Re-vote button is present before reveal() returns
    await this.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 5_000 })
  }

  // -- Lobby results actions -------------------------------------------------

  /** Tap "Next Round N" from the lobby results section and confirm the modal. */
  async nextRound(title?: string): Promise<void> {
    await this.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn }).click()
    const modal = this.page.locator('app-round-start-sheet')
    // Same desktop-dialog caveat as startRound() — use 'attached' not 'visible'.
    await modal.waitFor({ state: 'attached' })
    if (title) {
      await modal.locator('ion-input').locator('input').fill(title)
    }
    const startBtn = this.page.locator(ROUND_START.startBtn)
    await startBtn.waitFor({ state: 'attached' })
    await startBtn.evaluate((el: HTMLElement) => el.click())
    await this.page.waitForURL(/\/estimating/)
  }

  /** Tap "Re-vote" from the lobby results section — navigates to /estimating. */
  async revote(): Promise<void> {
    await this.page
      .locator(LOBBY.revoteBtn)
      .evaluate((el: HTMLElement) => el.click())
    await this.page.waitForURL(/\/estimating/, { timeout: 10_000 })
  }

  // -- Settings (from lobby) ------------------------------------------------

  /** Open session settings sheet from the lobby subtitle button. */
  async openSettings(): Promise<void> {
    await this.page.locator(LOBBY.subtitle).click()
    await this.page.locator('app-session-settings-sheet').waitFor({ state: 'visible' })
  }

  /** Change the estimation scale. Assumes settings sheet is open. */
  async changeScale(scaleLabel: string): Promise<void> {
    await this.page.locator(SETTINGS_SHEET.scaleRow).click()
    await this.page.locator(SCALE_PICKER.option(scaleLabel)).click()
    const doneBtn = this.page.locator(SCALE_PICKER.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
  }

  /** Change the access mode. Assumes settings sheet is open. */
  async changeAccess(modeLabel: string, password?: string): Promise<void> {
    await this.page.locator(SETTINGS_SHEET.accessRow).click()
    await this.page.locator(ACCESS_PICKER.option(modeLabel)).click()
    if (password) {
      const input = this.page.locator(ACCESS_PICKER.passwordInput).locator('input')
      await input.fill(password)
      // Trigger commit (blur)
      await input.press('Enter')
    }
    const doneBtn = this.page.locator(ACCESS_PICKER.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
  }

  /** Join with a password — enters code, waits for password field, fills it. */
  async joinSessionWithPassword(code: string, password: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/home`)
    await this.page.waitForURL(/\/(home|onboarding)/)
    if (this.page.url().includes('/onboarding')) {
      await this.onboard()
    }
    await this.page.locator(HOME.joinCard).click()
    await this.page.waitForURL(/\/join/)
    await fillRoomCode(this.page, code)
    // First submit resolves the room and reveals the password field
    await this.page.locator(JOIN.joinBtn).click()
    // Wait for the password input to appear
    const pwInput = this.page.locator(JOIN.passwordInput).locator('input')
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 })
    await pwInput.fill(password)
    // Second submit connects with the password
    await this.page.locator(JOIN.joinBtn).click()
    await this.page.waitForURL(/\/lobby/, { timeout: 10_000 })
  }

  /** Join via deep-link URL (/join?code=...). */
  async joinViaDeepLink(code: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/join?code=${code}`)
    await this.page.waitForURL(/\/(join|onboarding)/)
    if (this.page.url().includes('/onboarding')) {
      // Can't use onboard() here — it waits for /home, but the
      // pending-join-URL flow resumes to /join?code=... instead.
      const input = this.page.locator(ONBOARDING.nameInput).locator('input')
      await input.fill(this.displayName)
      await this.page.locator(ONBOARDING.continueBtn).click()
      await this.page.waitForURL(/\/(join|lobby)/)
    }
    // Deep-link auto-submit fires on JoinPage activation (ADR-0026 §3).
    // Wait for lobby content as success signal — works for both first-time
    // (onboarding redirect → JoinPage auto-submit) and returning-user paths.
    await this.page.locator(LOBBY.roomCode).waitFor({ state: 'visible', timeout: 10_000 })
  }

  /** Close the session settings sheet. */
  async closeSettings(): Promise<void> {
    const doneBtn = this.page.locator(SETTINGS_SHEET.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
    // Wait for modal dismiss animation
    await this.page.locator('app-session-settings-sheet').waitFor({ state: 'hidden' })
  }

  /**
   * Leave the current session via the ⋯ overflow popover → confirm.
   * Navigates to /home.
   *
   * Phase 2 (ADR-0039): ActionSheet replaced by ion-popover anchored to the
   * ⋯ button. Items are ion-item elements inside app-overflow-menu.
   */
  async leaveSession(): Promise<void> {
    // Open the ⋯ overflow popover. Scope to the active lobby page's header
    // because Ionic keeps the previous page (app-home) in the DOM during
    // navigation transitions, causing a strict-mode violation if unscoped.
    const url = this.page.url()
    const pageScope = url.includes('/estimating')
      ? 'app-estimating:not(.ion-page-hidden)'
      : 'app-lobby:not(.ion-page-hidden)'
    const overflowBtn = this.page
      .locator(`${pageScope} ion-header`)
      .getByRole('button', { name: 'More options' })
    await overflowBtn.click()

    // Wait for the popover and tap "Leave session".
    const popover = this.page.locator('ion-popover')
    await popover.waitFor({ state: 'visible', timeout: 5_000 })
    // Use text-based filter to pierce Ionic's web component attribute reflection.
    const leaveOption = popover.getByRole('listitem').filter({ hasText: 'Leave session' })
    await leaveOption.evaluate((el: HTMLElement) => el.click())

    // Confirm in alert
    const alert = this.page.locator('ion-alert')
    await alert.waitFor({ state: 'visible', timeout: 5_000 })
    const confirmBtn = this.page.locator('ion-alert button:has-text("Leave")')
    await confirmBtn.click()

    // Navigate to /home
    await this.page.waitForURL(/\/home/, { timeout: 5_000 })
  }

  // -- App settings (device-level preferences) -----

  /** Navigate to the app settings page (/settings). */
  async navigateToAppSettings(): Promise<void> {
    await this.page.goto(`${BASE_URL}/settings`)
    await this.page.waitForURL(/\/settings/)
  }

  /** Open the default scale picker and select a builtin scale by its label. */
  async setDefaultScale(scaleLabel: string): Promise<void> {
    await this.page.locator(APP_SETTINGS.defaultScaleRow).click()
    const displayLabel = resolveScaleDisplayLabel(scaleLabel)
    await this.page.locator(APP_SETTINGS_SCALE_PICKER.scaleRadio(displayLabel)).click()
    const doneBtn = this.page.locator(APP_SETTINGS_SCALE_PICKER.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
    // Wait for modal dismiss animation
    await this.page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' })
  }
  /** Toggle a preset scale card on or off. */
  async togglePresetCard(presetLabel: string, cardValue: string): Promise<void> {
    await this.page.locator(APP_SETTINGS.defaultScaleRow).click()

    const displayLabel = resolveScaleDisplayLabel(presetLabel)
    const editBtn = this.page.locator(APP_SETTINGS_SCALE_PICKER.editBtn(displayLabel))
    await editBtn.waitFor({ state: 'visible' })
    await editBtn.click()

    // Wait for the scale editor to appear
    await this.page.locator('app-scale-editor-sheet').waitFor({ state: 'visible' })

    // Click the toggle for the target card
    const cardToggle = this.page.locator(PRESET_CARD_EDITOR.cardToggle(cardValue))
    await cardToggle.waitFor({ state: 'visible' })
    await cardToggle.click()

    // Close the editor
    const doneBtn = this.page.locator(PRESET_CARD_EDITOR.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
    await this.page.locator('app-scale-editor-sheet').waitFor({ state: 'hidden' })

    // Close the scale picker
    const pickerDoneBtn = this.page.locator(APP_SETTINGS_SCALE_PICKER.doneBtn)
    await pickerDoneBtn.waitFor({ state: 'visible' })
    await pickerDoneBtn.evaluate((el: HTMLElement) => el.click())
    await this.page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' })
  }

  // -- Disconnect / reconnect -----------------------------------------------

  /** Simulate disconnect by closing the page (abrupt; awareness clears via WS close). */
  async disconnect(): Promise<void> {
    await this.page.close()
  }

  /** Reconnect: open a new page in the same context and join via code. */
  async reconnect(code: string): Promise<void> {
    this.page = await this.context.newPage()
    await this.page.goto(`${BASE_URL}/home`)
    await this.page.waitForURL(/\/(home|onboarding)/)
    if (this.page.url().includes('/onboarding')) {
      // Same context, so onboarding should be skipped (localStorage persists)
      // But if somehow needed:
      await this.onboard()
    }
    await this.page.locator(HOME.joinCard).click()
    await this.page.waitForURL(/\/join/)
    await fillRoomCode(this.page, code)
    await this.page.locator(JOIN.joinBtn).click()
    // After joining, the player lands on /lobby. If there's an active
    // round the lobby's auto-navigate effect may redirect to /estimating.
    await this.page.waitForURL(/\/(lobby|estimating)/, { timeout: 10_000 })
  }

  // -- Assertions -----------------------------------------------------------

  /**
   * Assert the lobby results section shows the given vote values (unordered).
   * Waits for /lobby and for the results section to appear.
   */
  async expectRevealedVotes(expected: string[]): Promise<void> {
    await this.page.waitForURL(/\/lobby/)
    const resultsSection = this.page.locator(LOBBY.resultsSection)
    await resultsSection.waitFor({ state: 'visible', timeout: 10_000 })
    const cards = this.page.locator(LOBBY.groupCard)
    await cards.first().waitFor({ state: 'visible' })
    // Collect all card values from vote groups (scoped to results section)
    const allChips: string[] = []
    const groupCount = await this.page.locator(LOBBY.voteGroups).count()
    for (let i = 0; i < groupCount; i++) {
      const group = this.page.locator(LOBBY.voteGroups).nth(i)
      const cardValue = await group.locator('.card').textContent()
      const chipLabels = await group.locator('ion-chip ion-label').allTextContents()
      for (const _ of chipLabels) {
        allChips.push(cardValue?.trim() ?? '')
      }
    }
    const sorted = [...allChips].sort()
    const expectedSorted = [...expected].sort()
    if (sorted.join(',') !== expectedSorted.join(',')) {
      throw new Error(`Expected votes [${expectedSorted}] but got [${sorted}]`)
    }
  }

  /** Assert votes are hidden (on the estimating page). */
  async expectVotesHidden(): Promise<void> {
    // On the estimating page, there is no revealed data — just dot indicators
    // Verify we are on estimating (not revealed, no results section visible)
    const url = this.page.url()
    if (!url.includes('/estimating')) {
      throw new Error(`Expected to be on /estimating but URL is ${url}`)
    }
    // Ensure results section (shown after reveal) is not visible.
    // Phase 4: results are in ion-card.section-card:has(app-vote-results).
    await this.page.locator(LOBBY.resultsSection).waitFor({ state: 'hidden' })
  }

  /** Assert this participant sees host controls. */
  async expectIsHost(): Promise<void> {
    // Host sees "Reveal Votes" on estimating or "Start Round" / "Next Round" on lobby
    const url = this.page.url()
    if (url.includes('/estimating')) {
      await this.page.locator(ESTIMATING.revealBtn).waitFor({ state: 'visible' })
    } else if (url.includes('/lobby')) {
      // Either Start Round or Next Round button is visible for host
      const startBtn = this.page.locator('ion-button', { hasText: LOBBY.startRoundBtn })
      const nextBtn = this.page.locator('ion-button', { hasText: LOBBY.nextRoundBtn })
      const startVisible = await startBtn.isVisible().catch(() => false)
      const nextVisible = await nextBtn.isVisible().catch(() => false)
      if (!startVisible && !nextVisible) {
        throw new Error('Expected host controls to be visible on lobby')
      }
    }
  }

  /** Assert participant count shown in lobby. */
  async expectParticipantCount(n: number): Promise<void> {
    const { expect } = await import('@playwright/test')
    // Ionic's router outlet briefly keeps two app-lobby instances in DOM
    // during forward/back navigation transitions (neither gets ion-page-hidden
    // until the animation settles). Wait until only one non-hidden lobby
    // remains before asserting, so strict-mode doesn't fire on the transient
    // duplicate (reproduced in back-button-soft-exit after banner tap returns
    // to the same lobby URL).
    await expect(this.page.locator(LOBBY.participantCount)).toHaveCount(1, { timeout: 5_000 })
    await expect(this.page.locator(LOBBY.participantCount)).toContainText(`(${n})`)
  }
}

// ---------------------------------------------------------------------------
// Fixture definition
// ---------------------------------------------------------------------------

interface AppFixtures {
  host: Participant
  player: Participant
  /** Factory for tests that need more than 2 participants. */
  createParticipant: (name: string) => Promise<Participant>
}

/**
 * Wire a fail-fast guard onto a page that records any uncaught script error
 * or `console.error('hnch bootstrap failed', ...)`. The fixture's `use()`
 * wrapper later asserts the array is empty so a bootstrap regression aborts
 * the test instead of letting every locator burn the 20s test timeout
 * against a blank app-root.
 *
 * Throwing inside `page.on()` listeners doesn't reliably surface as a test
 * failure across Playwright versions — collecting and asserting at teardown
 * is the canonical pattern.
 *
 * History: PR #84 shipped an `inject()`-after-await in the AccentService
 * APP_INITIALIZER. Bootstrap rejected → blank page → 73 tests × 20s ≈ full
 * 10-min CI cap. This guard plus 0-bootstrap-smoke.spec.ts turns that class
 * of regression into a fast, readable failure.
 */
function attachBootstrapGuard(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', err => {
    errors.push(`Uncaught page error: ${err.message}`)
  })
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('hnch bootstrap failed') || text.includes('NG0203')) {
      errors.push(`App bootstrap error: ${text}`)
    }
  })
  return errors
}

function assertNoBootstrapErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Bootstrap guard tripped:\n  - ${errors.join('\n  - ')}`)
  }
}

async function clearStorage(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // addInitScript fires on every frame navigation including sandboxed iframes
    // (e.g. Ionic modal frames) where localStorage access throws SecurityError.
    // Guard: bail out if localStorage is not accessible.
    try { localStorage.length } catch { return }

    // Preserve all user-identity and device-preference keys written by the
    // app under the CapacitorStorage prefix. Only session-bleed keys (last
    // session cache, room state) should be cleared. List what to KEEP so
    // future keys default to preserved unless explicitly opted out.
    const KEEP = new Set([
      'CapacitorStorage.hnch.displayName',
      'CapacitorStorage.hnch.pendingJoinUrl',
      'CapacitorStorage.hnch.participantId',    // ParticipantIdService stable device ID
      'CapacitorStorage.hnch.presetOverrides',
      'CapacitorStorage.hnch.customScales',
      'CapacitorStorage.hnch.defaultScaleId',
      'CapacitorStorage.hnch.defaultSessionName',
      'CapacitorStorage.hnch.defaultPassword',
      'CapacitorStorage.hnch.relayHttpUrl',
      'CapacitorStorage.hnch.lastSession',
      '_capuid',                                // Capacitor Device plugin web fallback UUID
    ])
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && !KEEP.has(key)) localStorage.removeItem(key)
    }
  })
}

export const test = base.extend<AppFixtures>({
  host: async ({ browser }, use) => {
    const context = await browser.newContext()
    await clearStorage(context)
    const page = await context.newPage()
    const errors = attachBootstrapGuard(page)
    const host = new Participant(context, page, 'Host')
    await use(host)
    await context.close()
    assertNoBootstrapErrors(errors)
  },

  player: async ({ browser }, use) => {
    const context = await browser.newContext()
    await clearStorage(context)
    const page = await context.newPage()
    const errors = attachBootstrapGuard(page)
    const player = new Participant(context, page, 'Player')
    await use(player)
    await context.close()
    assertNoBootstrapErrors(errors)
  },

  createParticipant: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    const errorBuckets: string[][] = []
    const factory = async (name: string): Promise<Participant> => {
      const context = await browser.newContext()
      await clearStorage(context)
      contexts.push(context)
      const page = await context.newPage()
      errorBuckets.push(attachBootstrapGuard(page))
      return new Participant(context, page, name)
    }
    await use(factory)
    for (const ctx of contexts) {
      await ctx.close()
    }
    for (const errors of errorBuckets) {
      assertNoBootstrapErrors(errors)
    }
  },
})

export { expect } from '@playwright/test'
