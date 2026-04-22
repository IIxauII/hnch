# E2E Test Suite Design

## Goal

Add a Playwright-based end-to-end test suite that exercises all user-facing flows through Phase 4 of the hnch roadmap. Tests run against real browser instances talking to real relay and client dev servers — no mocks, no simulated Yjs docs.

The suite must handle **multi-client scenarios**: hnch's core mechanic requires multiple participants interacting in the same session simultaneously. Playwright's multi-context support makes this possible within a single test.

## Package Location

New pnpm workspace package at `packages/e2e`. E2e tests depend on both the client and relay, so they belong to neither — a dedicated package keeps concerns isolated and avoids polluting either app's dependency tree.

```
packages/e2e/
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── tests/
    ├── fixtures/
    │   ├── app.fixture.ts
    │   └── helpers.ts
    ├── session-creation.spec.ts
    ├── join-by-code.spec.ts
    ├── voting-flow.spec.ts
    ├── manual-reveal.spec.ts
    ├── timer-reveal.spec.ts
    ├── vote-change.spec.ts
    ├── host-election.spec.ts
    ├── round-management.spec.ts
    ├── settings.spec.ts
    └── rejoin-rehydration.spec.ts
```

## Server Lifecycle

Playwright's `webServer` config starts both servers before tests and tears them down after. No manual server management.

```typescript
// playwright.config.ts (relevant excerpt)
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
```

- **Locally:** `reuseExistingServer: true` means if you already have `pnpm dev` running, Playwright skips startup and uses the existing servers. Fast iteration.
- **CI:** starts fresh every time.

## Browser Matrix

**Chromium only** for development and the default test run. The config defines Webkit and Firefox as additional projects that can be enabled via `--project webkit` or in CI. Webkit matters for the iOS/Capacitor target.

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
],
```

## Multi-Client Fixture

The central piece. A custom Playwright fixture that provides multiple independent browser contexts, each representing a different participant with its own device identity.

```typescript
// tests/fixtures/app.fixture.ts

type Participant = {
  page: Page;
  createSession: () => Promise<string>;  // returns room code
  joinSession: (code: string) => Promise<void>;
  castVote: (value: string) => Promise<void>;
  reveal: () => Promise<void>;
  startRound: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: (code: string) => Promise<void>;
  // ... assertion helpers
  expectVotesVisible: (values: string[]) => Promise<void>;
  expectVotesHidden: () => Promise<void>;
  expectIsHost: () => Promise<void>;
  expectParticipantCount: (n: number) => Promise<void>;
  expectRoundInHistory: (index: number) => Promise<void>;
};

// Usage in tests:
test('two players vote and reveal', async ({ host, player }) => {
  const code = await host.createSession();
  await player.joinSession(code);
  await host.castVote('5');
  await player.castVote('8');
  await host.reveal();
  await host.expectVotesVisible(['5', '8']);
  await player.expectVotesVisible(['5', '8']);
});
```

Each participant gets a fresh `BrowserContext` with isolated storage, so the Capacitor Device ID layer (or its web fallback) assigns a unique identity. The fixture factory supports creating N participants for tests that need more than two.

## Helper Layer (Page Object)

The `Participant` interface above doubles as the page-object layer. All UI interaction goes through these methods — spec files never contain raw selectors. This means:

- Selector changes are fixed in one place.
- Spec files read as user stories, not DOM traversal.
- Async waits (WebSocket sync settling, animation completion) are encapsulated per-action.

Key actions and what they do:

| Method | Steps |
|--------|-------|
| `createSession()` | Navigate to home, tap "New Session", wait for room code, return it |
| `joinSession(code)` | Navigate to home, tap "Join", enter code, submit, wait for session view |
| `castVote(value)` | Tap the card with the given value |
| `reveal()` | Tap the reveal button (host only) |
| `startRound()` | Tap "New Round" (host only) |
| `changeSettings(opts)` | Open settings panel, apply changes, close |
| `disconnect()` | Close the page (simulates tab/app close) |
| `reconnect(code)` | Open a new page in the same context, navigate to the session via code |
| `expectVotesVisible(values)` | Assert all revealed vote values are present and match |
| `expectVotesHidden()` | Assert votes are face-down / not revealed |
| `expectIsHost()` | Assert host controls are visible |
| `expectParticipantCount(n)` | Assert participant list length |
| `expectRoundInHistory(index)` | Assert a completed round exists at the given position |

## Test Flows

### 1. Session Creation (`session-creation.spec.ts`)

Single client creates a new session.

- Room code is displayed (6 chars, alphanumeric).
- Host sees the voting area with the default scale.
- Participant count is 1.
- Host controls (reveal, new round) are visible.

### 2. Join by Code (`join-by-code.spec.ts`)

Second client joins using the room code.

- Player enters the code from test 1's flow.
- Player lands in the session view.
- Both clients see participant count = 2.
- Player does NOT see host controls.

### 3. Voting Flow (`voting-flow.spec.ts`)

Both clients cast votes, verify they're hidden.

- Host and player each select a card value.
- Both clients show vote indicators (face-down cards) for both participants.
- Neither client can see the other's actual vote value.

### 4. Manual Reveal (`manual-reveal.spec.ts`)

Host triggers reveal, both clients see all votes.

- Host and player vote.
- Host taps reveal.
- Both clients see all vote values simultaneously.
- Vote values match what was cast.

### 5. Timer Reveal (`timer-reveal.spec.ts`)

Timer-driven auto-reveal on expiry.

- Host sets reveal mode to `timer` and sets `timerDurationMs` to `5000` (5 seconds) via the settings UI.
- Host starts a round — timer begins.
- Both clients see the countdown.
- On expiry, votes auto-reveal for both clients without host intervention.

**Note:** This test depends on real clock time. The 5-second timer keeps the test fast while exercising the real timer path end-to-end. Do not use fake timers — this is e2e. Use a generous assertion timeout (~10s) to absorb relay sync latency.

### 6. Vote Change (`vote-change.spec.ts`)

Participant changes vote before reveal.

- Player votes '3', then changes to '8'.
- Host reveals.
- Both clients see the updated value ('8'), not the original.

### 7. Host Election (`host-election.spec.ts`)

Host disconnects, new host is elected.

- Host creates session, player joins.
- Host disconnects (close browser context).
- After the 5-second debounce (ADR-0010), player becomes host.
- Player sees host controls appear.

**Timeout handling:** Use `expect(...).toBeVisible({ timeout: 10_000 })` to account for the 5s debounce plus sync propagation. This is inherently timing-sensitive — the generous timeout avoids flakiness without fake timers.

### 8. Round Management (`round-management.spec.ts`)

Start new rounds, verify history.

- Host and player vote, host reveals.
- Host starts a new round.
- Previous round appears in history with the correct votes.
- New round is active with no votes cast.

### 9. Settings (`settings.spec.ts`)

Change session settings, verify they propagate.

- Host changes the estimation scale.
- Both clients see the new scale's card values.
- Host changes reveal mode (manual to timer or vice versa).
- Both clients see the updated reveal mode.
- Host changes timer duration.
- Both clients see the updated duration.

### 10. Rejoin / Snapshot Rehydration (`rejoin-rehydration.spec.ts`)

Client disconnects and reconnects, state is preserved.

- Host and player are in a session with votes cast (not yet revealed).
- Player disconnects (close page).
- Player reconnects by navigating back to the same room code.
- Player sees the current session state: participants, current round, their own vote, settings.

This exercises the relay's 24h snapshot rehydration (ADR-0012) and the client's reconnection path.

## Scripts

**Root `package.json`:**
```json
"test:e2e": "pnpm --filter @hnch/e2e test"
```

**`packages/e2e/package.json`:**
```json
{
  "name": "@hnch/e2e",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:chromium": "playwright test --project chromium",
    "test:webkit": "playwright test --project webkit",
    "test:firefox": "playwright test --project firefox"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0"
  }
}
```

## Configuration Details

### `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,  // multi-client tests share relay state; serial is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // each test creates its own session, but relay is shared
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
});
```

### `tsconfig.json`

Extends the root base config. Targets ESNext. No paths aliasing needed — the e2e package only imports from Playwright.

## Parallelism Decision

Tests run **serially** (`workers: 1`, `fullyParallel: false`). Rationale:

- All tests hit the same relay instance. Parallel tests would create interleaving sessions on the same relay, which works in theory (each session has its own room code) but adds a failure mode that isn't worth debugging in v1.
- Individual tests are fast (each is a few seconds of browser interaction + WebSocket sync).
- The full suite of 10 tests should complete in under 2 minutes serially.

If this becomes a bottleneck later, the fix is straightforward: spin up a fresh relay per worker using dynamic ports.

## What This Does NOT Cover

- **Native platform testing** (Capacitor on iOS/Android) — remains manual per the Phase 6 plan.
- **Access control flows** (passwords, invite tokens) — not yet implemented (Phase 5). Tests should be added when that phase ships.
- **Accessibility automation** — deferred. The e2e infrastructure supports adding axe-core scans later.
- **Visual regression** — not in scope. Can be layered on with Playwright's screenshot comparison if desired.
- **Performance benchmarks** — e2e tests verify correctness, not speed.
