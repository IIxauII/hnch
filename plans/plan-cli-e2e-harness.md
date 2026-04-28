# CLI e2e harness — Playwright-style suite for `packages/cli`

## Context

`packages/cli` ships an Ink (React-in-terminal) client that mirrors the mobile client flows: create / join / vote / reveal / resume / password / multi-participant. Today it has only unit + light integration tests (`session.test.ts` spins a relay but does not exercise the Ink UI). There is no test that drives the rendered terminal frames the way `packages/e2e` drives the browser.

Goal: a Playwright-analog harness that

- spawns the real built `hnch` binary as a child process with a real TTY,
- captures rendered Ink frames from stdout,
- sends keystrokes via stdin,
- orchestrates 2+ concurrent participants against a shared relay,
- exposes a `CliParticipant` class with the same shape as the Playwright `Participant` (createSession, joinSession, castVote, reveal, expectFrame, …),
- auto-launches the relay (mirroring Playwright's `webServer`).

This plan introduces a new workspace package `packages/cli-e2e` that mirrors `packages/e2e` in layout and conventions.

## Why a new package vs `packages/cli/test`

- `packages/cli` already runs vitest (fast, in-process). Mixing slow PTY-driven e2e there would slow `pnpm --filter @hnch/cli test` and tangle deps (`node-pty`).
- `packages/e2e` is already gated separately in CI. Following the same split keeps CI gating simple.
- Pattern parity: `packages/e2e` ↔ `packages/cli-e2e`.

## Why `node-pty` (not `ink-testing-library`, not plain `child_process`)

| Option | What it gives | Verdict |
|--------|---------------|---------|
| `ink-testing-library` | In-process render, no real binary | not e2e (skips yargs, config I/O, real WS, exit codes) |
| `child_process.spawn` w/ pipes | Real binary spawn | Ink raw mode requires a TTY; pipes fail |
| `node-pty` | Real TTY around real binary | true e2e, parity with Playwright "real browser" stance |

`node-pty` is a native module — already battle-tested (used by VS Code, Hyper). One-time CI cache for the prebuilt binary.

## Layout (mirrors `packages/e2e`)

```
packages/cli-e2e/
├── package.json
├── vitest.config.ts                 # workers: 1, globalSetup, 30s timeout
├── src/
│   ├── global-setup.ts              # build CLI once, start relay, env injection
│   ├── fixtures/
│   │   ├── cli-participant.ts       # CliParticipant class (analog of Participant)
│   │   ├── relay.ts                 # spawn @hnch/relay dev with HNCH_ROOM_CAP=3
│   │   └── temp-home.ts             # per-participant XDG_CONFIG_HOME tmpdir
│   └── helpers/
│       ├── ansi.ts                  # stripAnsi, frame buffer, waitForText
│       ├── keys.ts                  # KEY constants: ENTER, UP, DOWN, ESC, CTRL_C, …
│       └── selectors.ts             # text fragments per screen (LOBBY.code, VOTING.card)
└── tests/
    ├── create-session.spec.ts
    ├── join-flow.spec.ts
    ├── voting-flow.spec.ts
    ├── multi-participant.spec.ts
    ├── password.spec.ts
    └── resume.spec.ts
```

## Critical files to read / reuse

- `packages/cli/src/index.ts` — yargs commands `create|join|resume|config`
- `packages/cli/src/config.ts:34` — `configDir()` honours `XDG_CONFIG_HOME` → trivial per-process isolation
- `packages/cli/src/sync.ts` — `HNCH_RELAY_URL` env var override
- `packages/cli/src/last-session.ts` — last-session cache, lives under `XDG_CONFIG_HOME`
- `packages/e2e/playwright.config.ts` — shape for `webServer` block to copy
- `packages/e2e/tests/fixtures/app.fixture.ts` — `Participant` class to mirror
- `packages/cli/test/session.test.ts` — already shows how to spin a relay in-test (reuse the helper)

## `CliParticipant` API (parity with `Participant`)

```ts
export class CliParticipant {
  constructor(opts: { displayName: string; relayUrl: string; homeDir: string })

  // process lifecycle
  spawn(args: string[]): Promise<void>
  kill(signal?: NodeJS.Signals): void
  expectExited(code?: number, timeoutMs?: number): Promise<void>

  // I/O primitives
  sendKeys(text: string): void                         // raw text or KEY.*
  press(key: keyof typeof KEYS): void                  // ENTER, UP, DOWN, ESC, CTRL_C
  getFrame(): string                                   // current screen, ANSI-stripped
  waitFor(text: string | RegExp, timeoutMs?: number): Promise<void>
  expectFrame(text: string | RegExp): Promise<void>

  // domain helpers (mirror packages/e2e)
  createSession(opts?: { name?: string; scale?: string; password?: string }): Promise<string>
  joinSession(code: string, opts?: { password?: string }): Promise<void>
  resumeSession(): Promise<void>
  castVote(value: string): Promise<void>
  reveal(): Promise<void>
  revote(): Promise<void>
  startNextRound(): Promise<void>
  toggleRole(): Promise<void>

  // assertions
  expectIsHost(): Promise<void>
  expectParticipantCount(n: number): Promise<void>
  expectRevealedVotes(values: string[]): Promise<void>
}
```

Frame buffering: subscribe to PTY `data` events, append to a rolling string, normalize CR/LF, strip ANSI via `strip-ansi`, expose latest "frame" (since the last full clear) to assertions. `waitFor` polls the buffer with a 50 ms tick and a default 10 s timeout.

## Isolation per participant

Each `CliParticipant` gets its own:

- `XDG_CONFIG_HOME=<tmpdir>/<name>` → isolated `config.json` + `last-session.json`
- pre-seeded `config.json` (skip first-run prompt) with a unique `participantId`, the test `displayName`, and `relayUrl: http://localhost:1234`
- `HNCH_RELAY_URL=http://localhost:1234` (belt + suspenders)

After each test: `kill()` if alive, `rm -rf` the tmpdir.

## Relay lifecycle

`global-setup.ts` spawns `pnpm --filter @hnch/relay dev` with `HNCH_ROOM_CAP=3`, `HNCH_ENABLE_TEST_ROUTES=1` — same env as Playwright. `globalTeardown` kills it. Locally honour `reuseExistingServer` by probing port 1234 first.

CLI binary: build once in `global-setup` (`pnpm --filter @hnch/cli build`) and spawn `node packages/cli/dist/index.js …`. Avoids the `tsx` startup tax per spawn and tests the real shipped artifact.

## vitest.config.ts shape

```ts
export default defineConfig({
  test: {
    globalSetup: ['./src/global-setup.ts'],
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },   // workers: 1
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['tests/**/*.spec.ts'],
  },
})
```

## Initial test coverage (parity with `packages/e2e` smoke set)

1. `create-session.spec.ts` — host creates room, sees lobby, room code printed to stderr matches frame.
2. `join-flow.spec.ts` — second participant joins with valid code; bad code surfaces error + exit 1.
3. `voting-flow.spec.ts` — host + voter cast votes, host reveals, both see results frame.
4. `multi-participant.spec.ts` — 3 participants, unanimous auto-reveal.
5. `password.spec.ts` — password-protected room: correct + wrong password.
6. `resume.spec.ts` — host quits, runs `hnch resume`, rejoins same room.

## CI integration

Add a `cli-e2e` job to `.github/workflows/ci.yml`:

- gate: changes under `packages/cli/**`, `packages/cli-e2e/**`, `packages/shared/**`, or `packages/relay/**`
- steps: pnpm install → build shared → build cli → `pnpm --filter @hnch/cli-e2e test`
- cache `~/.npm/_libcache/node-pty` (or use `@homebridge/node-pty-prebuilt-multiarch` to skip native compile)

## Risks / open questions

1. **`node-pty` native build on CI** — mitigated by prebuilt fork or by switching the dep choice during impl if compile flakiness shows up.
2. **Frame-diffing brittleness** — Ink redraws on every state change; assertions match against ANSI-stripped substrings, not full snapshots, to stay robust.
3. **Windows support** — `node-pty` is cross-platform but tests don't need Windows now; CI is Linux-only.
4. **Speed** — full suite ~30–60 s for 6 specs; sequential workers OK at this size.

## Verification

- `pnpm --filter @hnch/cli-e2e test` passes locally (relay auto-starts, all 6 specs green).
- Manual sanity: kill the relay mid-test → suite fails with clear timeout, not silent hang.
- CI run on the feature branch: cli-e2e job green; no regression in existing `e2e` job.
- Spot-check one frame assertion by running `pnpm --filter @hnch/cli-e2e test --reporter=verbose` and confirming the captured frame on failure is human-readable.
