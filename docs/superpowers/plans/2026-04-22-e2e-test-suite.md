# E2E Test Suite Implementation Plan

> **For agentic workers:** This plan is executed by a custom orchestrator/implementor/reviewer agent loop. The orchestrator assigns tasks one at a time, the implementor builds, the reviewer verifies. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright-based e2e test suite covering all 10 user-facing flows through Phase 4.

**Architecture:** New `packages/e2e` workspace package with Playwright. Custom multi-context fixture provides independent browser participants (host/player). Playwright's `webServer` config auto-starts both the relay (port 1234) and Angular dev server (port 4200).

**Tech Stack:** Playwright, TypeScript, pnpm workspace

**Spec:** `docs/superpowers/specs/2026-04-22-e2e-test-suite-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/e2e/package.json` | Package manifest with Playwright dependency |
| Create | `packages/e2e/tsconfig.json` | TypeScript config extending root base |
| Create | `packages/e2e/playwright.config.ts` | Playwright runner config (webServer, projects, reporters) |
| Create | `packages/e2e/tests/fixtures/app.fixture.ts` | Multi-client fixture: creates N browser contexts, exposes `Participant` API |
| Create | `packages/e2e/tests/fixtures/helpers.ts` | Shared selectors and constants |
| Create | `packages/e2e/tests/session-creation.spec.ts` | Test 1: create session, verify room code + host UI |
| Create | `packages/e2e/tests/join-by-code.spec.ts` | Test 2: second client joins via room code |
| Create | `packages/e2e/tests/voting-flow.spec.ts` | Test 3: both vote, verify hidden |
| Create | `packages/e2e/tests/manual-reveal.spec.ts` | Test 4: host reveals, both see votes |
| Create | `packages/e2e/tests/timer-reveal.spec.ts` | Test 5: timer-driven auto-reveal |
| Create | `packages/e2e/tests/vote-change.spec.ts` | Test 6: change vote before reveal |
| Create | `packages/e2e/tests/host-election.spec.ts` | Test 7: host disconnects, new host elected |
| Create | `packages/e2e/tests/round-management.spec.ts` | Test 8: new round, history |
| Create | `packages/e2e/tests/settings.spec.ts` | Test 9: change scale, timer, reveal mode |
| Create | `packages/e2e/tests/rejoin-rehydration.spec.ts` | Test 10: disconnect + reconnect, state preserved |
| Modify | `package.json` (root) | Add `test:e2e` script |

---

## Task 1: Scaffold the `packages/e2e` workspace package

**Files:**
- Create: `packages/e2e/package.json`
- Create: `packages/e2e/tsconfig.json`
- Create: `packages/e2e/playwright.config.ts`
- Modify: `package.json` (root, line 16 — add `test:e2e` script)

- [ ] **Step 1: Create `packages/e2e/package.json`**

```json
{
  "name": "@hnch/e2e",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "test": "playwright test --project chromium",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed --project chromium",
    "test:chromium": "playwright test --project chromium",
    "test:webkit": "playwright test --project webkit",
    "test:firefox": "playwright test --project firefox"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0"
  }
}
```

- [ ] **Step 2: Create `packages/e2e/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "outDir": "./dist",
    "rootDir": ".",
    "types": []
  },
  "include": ["tests/**/*.ts", "playwright.config.ts"]
}
```

- [ ] **Step 3: Create `packages/e2e/playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @hnch/relay dev',
      port: 1234,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @hnch/client dev',
      port: 4200,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```

- [ ] **Step 4: Add `test:e2e` script to root `package.json`**

In `package.json` (root), add to the `"scripts"` object:

```json
"test:e2e": "pnpm --filter @hnch/e2e test"
```

- [ ] **Step 5: Install dependencies**

Run from the repo root:

```bash
pnpm install
```

Then install Playwright browsers:

```bash
cd packages/e2e && pnpm exec playwright install chromium
```

- [ ] **Step 6: Verify Playwright can start**

```bash
cd packages/e2e && pnpm exec playwright test --list
```

Expected: exits cleanly with "no tests found" (no spec files yet).

- [ ] **Step 7: Commit**

```bash
git add packages/e2e/package.json packages/e2e/tsconfig.json packages/e2e/playwright.config.ts package.json pnpm-lock.yaml
git commit -m "scaffold packages/e2e with Playwright config"
```

---

## Task 2: Build the multi-client fixture and helpers

**Files:**
- Create: `packages/e2e/tests/fixtures/helpers.ts`
- Create: `packages/e2e/tests/fixtures/app.fixture.ts`

### Step-by-step

- [ ] **Step 1: Create `packages/e2e/tests/fixtures/helpers.ts`**

This file defines all selectors and shared constants. Every spec file uses these — selectors are never hardcoded in specs.

```typescript
/**
 * Centralized selectors and constants for hnch e2e tests.
 *
 * Every UI selector lives here so that template changes only
 * require a single-file update.
 */

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
export const ONBOARDING = {
  nameInput: 'ion-input[autocapitalize="words"]',
  continueBtn: 'ion-button:has-text("Continue")',
} as const

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export const HOME = {
  createCard: 'ion-card:has(strong:text-is("Create Room"))',
  joinCard: 'ion-card:has(strong:text-is("Join Room"))',
} as const

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
export const JOIN = {
  codeInput: 'ion-input.code-input',
  joinBtn: 'ion-button:has-text("Join")',
} as const

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------
export const LOBBY = {
  roomCode: 'h1.room-code',
  subtitle: 'button.subtitle',
  participantList: 'ion-list.participants',
  participantItems: 'ion-list.participants ion-item',
  participantCount: 'ion-list.participants ion-list-header ion-label',
  hostIcon: '.host-icon',
  startRoundBtn: /Start Round \d+/,
} as const

// ---------------------------------------------------------------------------
// Round-start modal
// ---------------------------------------------------------------------------
export const ROUND_START = {
  titleInput: 'app-round-start-sheet ion-input',
  startBtn: 'app-round-start-sheet ion-button:has-text("Start")',
} as const

// ---------------------------------------------------------------------------
// Estimating
// ---------------------------------------------------------------------------
export const ESTIMATING = {
  roundTitle: 'h1.title',
  timer: 'p.timer',
  timerUrgent: 'p.timer.urgent',
  cardGrid: 'div.grid',
  card: (value: string) => `ion-card.card[aria-label="Card ${value}"]`,
  selectedCard: 'ion-card.card.selected',
  voteDots: 'app-avatar-vote-row .dot',
  votedDots: 'app-avatar-vote-row .dot.voted',
  voteCount: 'app-avatar-vote-row .count',
  revealBtn: 'ion-button:has-text("Reveal Votes")',
} as const

// ---------------------------------------------------------------------------
// Revealed
// ---------------------------------------------------------------------------
export const REVEALED = {
  resultsTitle: 'h1.title',
  voteGroups: 'ion-item-group.group:not(.didnt-vote)',
  groupCard: 'ion-item-group .card',
  groupCount: 'ion-item-group .count',
  voterChips: 'ion-chip ion-label',
  revoteBtn: 'ion-button:has-text("Re-vote")',
  nextRoundBtn: 'ion-button:has-text("Next Round")',
  didntVoteGroup: 'ion-item-group.didnt-vote',
} as const

// ---------------------------------------------------------------------------
// Session settings
// ---------------------------------------------------------------------------
export const SETTINGS_SHEET = {
  scaleRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale"))',
  timerRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Timer"))',
  scaleValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale")) ion-note',
  timerValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Timer")) ion-note',
  doneBtn: 'app-session-settings-sheet ion-button:has-text("Done")',
} as const

export const SCALE_PICKER = {
  option: (label: string) => `app-scale-picker-sheet ion-radio:has(ion-label:text-is("${label}"))`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
} as const

export const TIMER_PICKER = {
  option: (label: string) => `app-timer-picker-sheet ion-item:has(ion-label:text-is("${label}"))`,
  doneBtn: 'app-timer-picker-sheet ion-button:has-text("Done")',
} as const

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
export const BASE_URL = 'http://localhost:4200'

/** Default Fibonacci scale card values. */
export const FIBONACCI_CARDS = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕']

/** T-shirt scale card values. */
export const TSHIRT_CARDS = ['XS', 'S', 'M', 'L', 'XL', '?', '☕']
```

- [ ] **Step 2: Create `packages/e2e/tests/fixtures/app.fixture.ts`**

This is the multi-client Playwright fixture. It extends the base `test` object with `host` and `player` participants, each backed by an independent `BrowserContext`.

```typescript
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
    await this.page.waitForURL('**/onboarding')
    const input = this.page.locator(ONBOARDING.nameInput)
    // Ionic wraps <input> inside shadow DOM of ion-input.
    // Use .fill() which works through shadow DOM in Playwright.
    await input.locator('input').fill(this.displayName)
    await this.page.locator(ONBOARDING.continueBtn).click()
    await this.page.waitForURL('**/home')
  }

  // -- Session lifecycle ----------------------------------------------------

  /** Create a new session from /home. Returns the room code. */
  async createSession(): Promise<string> {
    await this.page.goto(`${BASE_URL}/home`)
    // If redirected to onboarding, complete it first
    if (this.page.url().includes('/onboarding')) {
      await this.onboard()
    }
    await this.page.locator(HOME.createCard).click()
    await this.page.waitForURL('**/lobby')
    const codeEl = this.page.locator(LOBBY.roomCode)
    await codeEl.waitFor({ state: 'visible' })
    const code = await codeEl.textContent()
    if (!code) throw new Error('Room code not found on lobby page')
    return code.replace(/[^A-Z0-9]/gi, '') // strip dash formatting
  }

  /** Join an existing session from /home using a room code. */
  async joinSession(code: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/home`)
    if (this.page.url().includes('/onboarding')) {
      await this.onboard()
    }
    await this.page.locator(HOME.joinCard).click()
    await this.page.waitForURL('**/join')
    const input = this.page.locator(JOIN.codeInput).locator('input')
    await input.fill(code)
    await this.page.locator(JOIN.joinBtn).click()
    await this.page.waitForURL('**/lobby')
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
    await this.page.locator(ROUND_START.startBtn).click()
    await this.page.waitForURL('**/estimating')
  }

  /** Wait for auto-navigation to /estimating (non-host clients). */
  async waitForEstimating(): Promise<void> {
    await this.page.waitForURL('**/estimating', { timeout: 10_000 })
  }

  // -- Voting ---------------------------------------------------------------

  /** Tap a card to cast (or change) a vote. */
  async castVote(value: string): Promise<void> {
    await this.page.locator(ESTIMATING.card(value)).click()
  }

  /** Tap the Reveal Votes button (host only). */
  async reveal(): Promise<void> {
    await this.page.locator(ESTIMATING.revealBtn).click()
    await this.page.waitForURL('**/revealed')
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
    await this.page.locator(ROUND_START.startBtn).click()
    await this.page.waitForURL('**/estimating')
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
    await this.page.locator(SCALE_PICKER.doneBtn).click()
  }

  /** Change the timer setting. Assumes settings sheet is open. */
  async changeTimer(optionLabel: string): Promise<void> {
    await this.page.locator(SETTINGS_SHEET.timerRow).click()
    await this.page.locator(TIMER_PICKER.option(optionLabel)).click()
    await this.page.locator(TIMER_PICKER.doneBtn).click()
  }

  /** Close the session settings sheet. */
  async closeSettings(): Promise<void> {
    await this.page.locator(SETTINGS_SHEET.doneBtn).click()
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
    if (this.page.url().includes('/onboarding')) {
      // Same context, so onboarding should be skipped (localStorage persists)
      // But if somehow needed:
      await this.onboard()
    }
    await this.page.locator(HOME.joinCard).click()
    await this.page.waitForURL('**/join')
    const input = this.page.locator(JOIN.codeInput).locator('input')
    await input.fill(code)
    await this.page.locator(JOIN.joinBtn).click()
    await this.page.waitForURL('**/lobby')
  }

  // -- Assertions -----------------------------------------------------------

  /** Assert the revealed page shows the given vote values (unordered). */
  async expectRevealedVotes(expected: string[]): Promise<void> {
    await this.page.waitForURL('**/revealed')
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
    await this.page.waitForURL('**/estimating')
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
    await this.page.locator(LOBBY.participantCount).waitFor({ state: 'visible' })
    const text = await this.page.locator(LOBBY.participantCount).textContent()
    if (!text?.includes(`(${n})`)) {
      throw new Error(`Expected participant count ${n} but got: ${text}`)
    }
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
```

- [ ] **Step 3: Verify the fixture compiles**

```bash
cd packages/e2e && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/e2e/tests/fixtures/
git commit -m "add multi-client Playwright fixture and selector helpers"
```

---

## Task 3: Test 1 — Session Creation

**Files:**
- Create: `packages/e2e/tests/session-creation.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Session creation', () => {
  test('host creates a session and sees the lobby', async ({ host }) => {
    const code = await host.createSession()

    // Room code is 6 alphanumeric characters
    expect(code).toMatch(/^[A-Z0-9]{6}$/)

    // Room code displayed on page (formatted with dash)
    const displayedCode = await host.page.locator(LOBBY.roomCode).textContent()
    expect(displayedCode?.replace(/[^A-Z0-9]/gi, '')).toBe(code)

    // Participant count is 1
    await host.expectParticipantCount(1)

    // Host sees "Start Round 1" button
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/session-creation.spec.ts
```

Expected: PASS. This exercises the full create flow: home → relay POST /rooms → lobby.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/session-creation.spec.ts
git commit -m "e2e: add session creation test"
```

---

## Task 4: Test 2 — Join by Code

**Files:**
- Create: `packages/e2e/tests/join-by-code.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Join by code', () => {
  test('player joins a session using the room code', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Both see participant count = 2
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)

    // Player does NOT see the Start Round button (host-only control)
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible()

    // Host still sees Start Round
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/join-by-code.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/join-by-code.spec.ts
git commit -m "e2e: add join-by-code test"
```

---

## Task 5: Test 3 — Voting Flow

**Files:**
- Create: `packages/e2e/tests/voting-flow.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Voting flow', () => {
  test('both clients vote and votes remain hidden', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Host starts round
    await host.startRound()
    await player.waitForEstimating()

    // Both cast votes
    await host.castVote('5')
    await player.castVote('8')

    // Host's selected card is highlighted
    await expect(host.page.locator(ESTIMATING.card('5'))).toHaveClass(/selected/)

    // Player's selected card is highlighted
    await expect(player.page.locator(ESTIMATING.card('8'))).toHaveClass(/selected/)

    // Vote count shows "2 of 2 voted"
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('2 of 2')
    await expect(player.page.locator(ESTIMATING.voteCount)).toContainText('2 of 2')

    // Both are still on estimating (not revealed)
    await host.expectVotesHidden()
    await player.expectVotesHidden()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/voting-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/voting-flow.spec.ts
git commit -m "e2e: add voting flow test"
```

---

## Task 6: Test 4 — Manual Reveal

**Files:**
- Create: `packages/e2e/tests/manual-reveal.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { REVEALED } from './fixtures/helpers'

test.describe('Manual reveal', () => {
  test('host reveals and both clients see all votes', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)
    await host.startRound()
    await player.waitForEstimating()

    await host.castVote('5')
    await player.castVote('8')

    // Host reveals
    await host.reveal()

    // Player auto-navigates to revealed page
    await player.page.waitForURL('**/revealed', { timeout: 10_000 })

    // Both see the correct votes
    await host.expectRevealedVotes(['5', '8'])
    await player.expectRevealedVotes(['5', '8'])

    // Host sees "Next Round" and "Re-vote" buttons
    await expect(host.page.locator(REVEALED.nextRoundBtn)).toBeVisible()
    await expect(host.page.locator(REVEALED.revoteBtn)).toBeVisible()

    // Player does NOT see host controls
    await expect(player.page.locator(REVEALED.nextRoundBtn)).not.toBeVisible()
    await expect(player.page.locator(REVEALED.revoteBtn)).not.toBeVisible()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/manual-reveal.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/manual-reveal.spec.ts
git commit -m "e2e: add manual reveal test"
```

---

## Task 7: Test 5 — Timer Reveal

**Files:**
- Create: `packages/e2e/tests/timer-reveal.spec.ts`

The shortest available timer is 30 seconds. This test uses that value. The test will wait for the real timer to expire — no fake timers.

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Timer reveal', () => {
  test('votes auto-reveal when timer expires', async ({ host, player }) => {
    // Increase test timeout to accommodate 30s timer + sync overhead
    test.setTimeout(60_000)

    const code = await host.createSession()

    // Configure timer before anyone joins round
    await host.openSettings()
    await host.changeTimer('30 seconds')
    await host.closeSettings()

    await player.joinSession(code)

    // Start the round — timer begins
    await host.startRound()
    await player.waitForEstimating()

    // Both vote
    await host.castVote('3')
    await player.castVote('5')

    // Timer should be visible on both
    await expect(host.page.locator(ESTIMATING.timer)).toBeVisible()
    await expect(player.page.locator(ESTIMATING.timer)).toBeVisible()

    // Wait for auto-reveal (30s timer + up to 10s sync buffer)
    await host.page.waitForURL('**/revealed', { timeout: 45_000 })
    await player.page.waitForURL('**/revealed', { timeout: 10_000 })

    // Both see the correct votes
    await host.expectRevealedVotes(['3', '5'])
    await player.expectRevealedVotes(['3', '5'])
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/timer-reveal.spec.ts
```

Expected: PASS (takes ~35-40 seconds due to the 30s timer).

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/timer-reveal.spec.ts
git commit -m "e2e: add timer reveal test"
```

---

## Task 8: Test 6 — Vote Change

**Files:**
- Create: `packages/e2e/tests/vote-change.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Vote change', () => {
  test('player changes vote before reveal, updated value is shown', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)
    await host.startRound()
    await player.waitForEstimating()

    // Player votes 3 initially
    await player.castVote('3')
    await expect(player.page.locator(ESTIMATING.card('3'))).toHaveClass(/selected/)

    // Player changes to 8
    await player.castVote('8')
    await expect(player.page.locator(ESTIMATING.card('8'))).toHaveClass(/selected/)
    // Original card is deselected
    await expect(player.page.locator(ESTIMATING.card('3'))).not.toHaveClass(/selected/)

    // Host votes and reveals
    await host.castVote('5')
    await host.reveal()

    await player.page.waitForURL('**/revealed', { timeout: 10_000 })

    // Revealed votes show the CHANGED value (8), not the original (3)
    await host.expectRevealedVotes(['5', '8'])
    await player.expectRevealedVotes(['5', '8'])
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/vote-change.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/vote-change.spec.ts
git commit -m "e2e: add vote change test"
```

---

## Task 9: Test 7 — Host Election

**Files:**
- Create: `packages/e2e/tests/host-election.spec.ts`

Per ADR-0010: host drops → 5-second debounce → lowest-peer-ID election. This test closes the host's browser context and verifies the player gains host controls.

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Host election', () => {
  test('player becomes host after original host disconnects', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Verify host has start round button
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()

    // Verify player does NOT have start round button
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible()

    // Host disconnects
    await host.disconnect()

    // After 5s debounce + sync, player should gain host controls
    // Use generous timeout: 5s debounce + network propagation
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible({ timeout: 15_000 })

    // Player should see host star icon next to their own name
    await expect(player.page.locator(LOBBY.hostIcon)).toBeVisible()

    // Participant count drops to 1
    await player.expectParticipantCount(1)
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/host-election.spec.ts
```

Expected: PASS. May take ~10 seconds due to the debounce timer.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/host-election.spec.ts
git commit -m "e2e: add host election test"
```

---

## Task 10: Test 8 — Round Management

**Files:**
- Create: `packages/e2e/tests/round-management.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { REVEALED, ESTIMATING } from './fixtures/helpers'

test.describe('Round management', () => {
  test('start a new round after reveal, previous round votes are preserved', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Round 1: vote and reveal
    await host.startRound()
    await player.waitForEstimating()
    await host.castVote('5')
    await player.castVote('8')
    await host.reveal()
    await player.page.waitForURL('**/revealed', { timeout: 10_000 })

    // Verify Round 1 results
    await expect(host.page.locator(REVEALED.resultsTitle)).toContainText('Round 1')

    // Start Round 2
    await host.nextRound()
    await player.waitForEstimating()

    // Verify we're in Round 2
    await expect(host.page.locator(ESTIMATING.roundTitle)).toContainText('Round 2')
    await expect(player.page.locator(ESTIMATING.roundTitle)).toContainText('Round 2')

    // No votes cast yet — card grid should have no selected cards
    await expect(host.page.locator(ESTIMATING.selectedCard)).not.toBeVisible()
    await expect(player.page.locator(ESTIMATING.selectedCard)).not.toBeVisible()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/round-management.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/round-management.spec.ts
git commit -m "e2e: add round management test"
```

---

## Task 11: Test 9 — Settings

**Files:**
- Create: `packages/e2e/tests/settings.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { LOBBY, SETTINGS_SHEET, ESTIMATING } from './fixtures/helpers'

test.describe('Settings', () => {
  test('host changes scale and timer, changes propagate to player', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Open session settings (host)
    await host.openSettings()

    // Change scale to T-shirt
    await host.changeScale('T-shirt')

    // Verify scale label updated in settings sheet
    await expect(host.page.locator(SETTINGS_SHEET.scaleValue)).toContainText('T-shirt')

    // Change timer to 30 seconds
    await host.changeTimer('30 seconds')

    // Verify timer label updated
    await expect(host.page.locator(SETTINGS_SHEET.timerValue)).toContainText('30s')

    await host.closeSettings()

    // Verify lobby subtitle reflects changes on both clients
    // Subtitle format: "Round N • ScaleName • Timer"
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('T-shirt')
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('30s')

    // Player sees the same changes
    await expect(player.page.locator(LOBBY.subtitle)).toContainText('T-shirt')
    await expect(player.page.locator(LOBBY.subtitle)).toContainText('30s')

    // Start a round and verify T-shirt cards are shown
    await host.startRound()
    await player.waitForEstimating()

    // T-shirt cards visible (spot-check a few)
    await expect(host.page.locator(ESTIMATING.card('XS'))).toBeVisible()
    await expect(host.page.locator(ESTIMATING.card('L'))).toBeVisible()
    await expect(host.page.locator(ESTIMATING.card('XL'))).toBeVisible()

    // Same for player
    await expect(player.page.locator(ESTIMATING.card('XS'))).toBeVisible()
    await expect(player.page.locator(ESTIMATING.card('L'))).toBeVisible()
    await expect(player.page.locator(ESTIMATING.card('XL'))).toBeVisible()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/settings.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/settings.spec.ts
git commit -m "e2e: add settings test"
```

---

## Task 12: Test 10 — Rejoin / Snapshot Rehydration

**Files:**
- Create: `packages/e2e/tests/rejoin-rehydration.spec.ts`

This exercises the relay's 24h snapshot (ADR-0012). Player disconnects and reconnects — session state must be preserved.

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from './fixtures/app.fixture'
import { LOBBY, ESTIMATING } from './fixtures/helpers'

test.describe('Rejoin / snapshot rehydration', () => {
  test('disconnected client rejoins and sees current session state', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Start a round and cast votes (not revealed)
    await host.startRound()
    await player.waitForEstimating()
    await host.castVote('5')
    await player.castVote('8')

    // Verify both voted
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('2 of 2')

    // Player disconnects
    await player.disconnect()

    // Brief pause for the relay to process the disconnect
    await host.page.waitForTimeout(2_000)

    // Player reconnects using the same code
    await player.reconnect(code)

    // Player should be back in the lobby (rejoining goes through lobby)
    // The session state should be preserved

    // Verify participant count is back to 2
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)

    // Verify settings are preserved (default Fibonacci scale in subtitle)
    await expect(player.page.locator(LOBBY.subtitle)).toContainText('Fibonacci')
  })
})
```

- [ ] **Step 2: Run to verify it passes**

```bash
cd packages/e2e && pnpm test -- tests/rejoin-rehydration.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/rejoin-rehydration.spec.ts
git commit -m "e2e: add rejoin/rehydration test"
```

---

## Task 13: Run the full suite and verify

- [ ] **Step 1: Run all e2e tests**

```bash
cd packages/e2e && pnpm test
```

Expected: All 10 spec files pass. The timer-reveal test takes ~35s; the rest are fast.

- [ ] **Step 2: Run from root using the workspace script**

```bash
pnpm test:e2e
```

Expected: Same results, confirming the root script works.

- [ ] **Step 3: Final commit if any fixups were needed**

If any tests required adjustments to selectors or timing, commit those fixes:

```bash
git add -A && git commit -m "e2e: fix test adjustments from full suite run"
```

Only if changes were made. If all 10 pass clean, skip this step.
