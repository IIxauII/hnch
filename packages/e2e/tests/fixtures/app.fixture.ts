import { test as base, type BrowserContext, type Page } from '@playwright/test'
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  REVEALED,
  SETTINGS_SHEET,
  SCALE_PICKER,
  TIMER_PICKER,
} from './helpers'

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
    const input = this.page.locator(JOIN.codeInput).locator('input')
    await input.fill(code)
    await this.page.locator(JOIN.joinBtn).click()
    await this.page.waitForURL(/\/lobby/)
  }

  // -- Lobby actions --------------------------------------------------------

  /** Tap "Start Round N" and confirm the modal. */
  async startRound(title?: string): Promise<void> {
    await this.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }).click()
    // Wait for the round-start modal to appear
    const modal = this.page.locator('app-round-start-sheet')
    await modal.waitFor({ state: 'visible' })
    if (title) {
      await modal.locator('ion-input').locator('input').fill(title)
    }
    const startBtn = this.page.locator(ROUND_START.startBtn)
    await startBtn.waitFor({ state: 'visible' })
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
    await this.page.locator(ESTIMATING.card(value)).click()
  }

  /** Tap the Reveal Votes button (host only). */
  async reveal(): Promise<void> {
    await this.page.locator(ESTIMATING.revealBtn).click()
    await this.page.waitForURL(/\/revealed/)
  }

  // -- Revealed page --------------------------------------------------------

  /** Tap "Next Round" and confirm the modal. */
  async nextRound(title?: string): Promise<void> {
    await this.page.locator(REVEALED.nextRoundBtn).click()
    const modal = this.page.locator('app-round-start-sheet')
    await modal.waitFor({ state: 'visible' })
    if (title) {
      await modal.locator('ion-input').locator('input').fill(title)
    }
    const startBtn = this.page.locator(ROUND_START.startBtn)
    await startBtn.waitFor({ state: 'visible' })
    await startBtn.evaluate((el: HTMLElement) => el.click())
    await this.page.waitForURL(/\/estimating/)
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

  /** Change the timer setting. Assumes settings sheet is open. */
  async changeTimer(optionLabel: string): Promise<void> {
    await this.page.locator(SETTINGS_SHEET.timerRow).click()
    await this.page.locator(TIMER_PICKER.option(optionLabel)).click()
    const doneBtn = this.page.locator(TIMER_PICKER.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
  }

  /** Close the session settings sheet. */
  async closeSettings(): Promise<void> {
    const doneBtn = this.page.locator(SETTINGS_SHEET.doneBtn)
    await doneBtn.waitFor({ state: 'visible' })
    await doneBtn.evaluate((el: HTMLElement) => el.click())
    // Wait for modal dismiss animation
    await this.page.locator('app-session-settings-sheet').waitFor({ state: 'hidden' })
  }

  // -- Disconnect / reconnect -----------------------------------------------

  /** Simulate disconnect by closing the page. */
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
    const input = this.page.locator(JOIN.codeInput).locator('input')
    await input.fill(code)
    await this.page.locator(JOIN.joinBtn).click()
    // After joining, the player lands on /lobby. If there's an active
    // round the lobby's auto-navigate effect may redirect to /estimating.
    await this.page.waitForURL(/\/(lobby|estimating)/, { timeout: 10_000 })
  }

  // -- Assertions -----------------------------------------------------------

  /** Assert the revealed page shows the given vote values (unordered). */
  async expectRevealedVotes(expected: string[]): Promise<void> {
    await this.page.waitForURL(/\/revealed/)
    const cards = this.page.locator(REVEALED.groupCard)
    await cards.first().waitFor({ state: 'visible' })
    // Collect all card values from vote groups
    const allChips: string[] = []
    const groupCount = await this.page.locator(REVEALED.voteGroups).count()
    for (let i = 0; i < groupCount; i++) {
      const group = this.page.locator(REVEALED.voteGroups).nth(i)
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
    // Verify we are on estimating (not revealed)
    await this.page.waitForURL(/\/estimating/)
  }

  /** Assert this participant sees host controls. */
  async expectIsHost(): Promise<void> {
    // Host sees "Reveal Votes" on estimating or "Start Round" on lobby
    const url = this.page.url()
    if (url.includes('/estimating')) {
      await this.page.locator(ESTIMATING.revealBtn).waitFor({ state: 'visible' })
    } else if (url.includes('/lobby')) {
      await this.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }).waitFor({ state: 'visible' })
    } else if (url.includes('/revealed')) {
      await this.page.locator(REVEALED.nextRoundBtn).waitFor({ state: 'visible' })
    }
  }

  /** Assert participant count shown in lobby. */
  async expectParticipantCount(n: number): Promise<void> {
    const { expect } = await import('@playwright/test')
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

export const test = base.extend<AppFixtures>({
  host: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const host = new Participant(context, page, 'Host')
    await use(host)
    await context.close()
  },

  player: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const player = new Participant(context, page, 'Player')
    await use(player)
    await context.close()
  },

  createParticipant: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    const factory = async (name: string): Promise<Participant> => {
      const context = await browser.newContext()
      contexts.push(context)
      const page = await context.newPage()
      return new Participant(context, page, name)
    }
    await use(factory)
    for (const ctx of contexts) {
      await ctx.close()
    }
  },
})

export { expect } from '@playwright/test'
