# `@hnch/e2e`

Playwright end-to-end tests for hnch. Multi-client, real-relay scenarios; no mocks.

## Layout

```
tests/
  _screenshots/         # opt-in screenshot capture suite (this README's focus)
  fixtures/             # shared selectors + browser-context helpers
  *.spec.ts             # functional e2e suites
```

## Running functional tests

```sh
pnpm --filter @hnch/e2e exec playwright test --project=chromium
```

The full suite spins up `pnpm dev:relay` and `pnpm dev:client` automatically via `playwright.config.ts` `webServer`. Use `--workers=1` for stability when investigating flakes.

## Screenshot harness

All screenshot specs live under `tests/_screenshots/` and are gated by `SCREENSHOT_CAPTURE=1`. Without the env var, they `test.skip` — they don't run as part of regular CI.

### Two surfaces

- **PR flow** — `lefthook` pre-push hook runs a scoped subset and publishes to the `screenshots` branch. See `CONTRIBUTING.md → Screenshots`.
- **Main flow** — `.github/workflows/screenshots-main.yml` runs the full suite on every push to `main` and commits to `docs/screenshots/<sha>/`.

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `SCREENSHOT_CAPTURE` | unset | When set (`1`), unlocks the screenshot specs. Without it, they skip. |
| `SCREENSHOT_SHA` | `local` | Output subdir name. CI/hook pass `sha-<short>`; manual runs default to `local`. |
| `SCREENSHOT_TAGS` | unset | Playwright `--grep` regex — narrows capture to scenes tagged with the listed tags (Phase 4). |
| `HNCH_ROOM_CAP` | unset | Relay-side participant cap, exercised by `participant-cap.spec.ts`. |

### Output

`docs/screenshots/<SHA>/<scene>.png` — relative to repo root. The `OUT_DIR` constant in each spec resolves via:

```ts
path.resolve(__dirname, '../../../../docs/screenshots', SHA);
```

### Local manual run

```sh
SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=local \
  pnpm --filter @hnch/e2e exec playwright test _screenshots \
  --project=chromium --workers=1
```

### Spec organization

- **`capture.spec.ts`** — single-host linear tour (onboarding → home → settings → join → lobby → estimating → results). Add single-context, single-viewport scenes here.
- **`<feature>.spec.ts`** — multi-client + timing-sensitive scenes (password, reveal, skip, history, participants, cap, session-end, connection). One file per UI surface.

### Tag catalog

Every `test()` under `_screenshots/` is annotated with one or more Playwright tags. `.screenshot-tags` (worktree root, gitignored) holds a `--grep` regex — `scripts/screenshot-publish.mjs` passes it through. Empty/missing → full suite runs. The file is materialised inside worktrees by `pnpm worktree:add --plan <slug>` (or `HNCH_PLAN_SLUG=<slug> pnpm worktree:bootstrap`), parsed from the plan doc's `## Screenshot tags` section. Skills do not write this file directly; the primary worktree (`main`) should never contain it.

| Tag | Scope |
|---|---|
| `@all` | always-run baseline (home, lobby, estimating) |
| `@theming` | color/theme/accent surfaces |
| `@layout` | layout-only changes (header, footer, padding) |
| `@participants` | participant list, roster |
| `@viewer` | viewer-role badges + toggles |
| `@host` | host-only actions |
| `@password` | password sheet + wrong-password reject |
| `@reveal` | pre/post-reveal frames |
| `@skip` | host skip action + suppressed votes |
| `@history` | round history |
| `@scale` | scale picker, custom scale editor, preset overrides |
| `@connection` | online / reconnecting / offline / disconnected |
| `@session-end` | host End Session → joiner toast |
| `@home` | home and last-session card |
| `@onboarding` | first-run name entry |

**`.screenshot-tags` format.** A single line containing a Playwright `--grep` regex (with optional trailing newline). Tags are space-separated inside test titles, so any tag substring matches. Authoritative source is the plan doc; this file is just the materialised cache inside a worktree. Examples:

```
# capture only viewer + participants scenes
@viewer|@participants

# capture all theming surfaces and the always-run baseline
@theming|@all

# capture reveal + skip flows
@reveal|@skip
```

**Skills (`/plan`, `/spec`, `/critique`).** `/plan` writes a `## Screenshot tags` section into the plan doc — a heading followed by a paragraph whose first inline code span is the regex (e.g. `` `@viewer|@participants` ``). `/spec` does not author tags. `/critique` reads the section from the plan doc and flags scope mismatches. The `.screenshot-tags` file is materialised inside the worktree at `pnpm worktree:add --plan <slug>` time, so parallel worktrees never collide on `main`.

**Tag-to-file map** (one tag → many tests across files; one test → many tags):

| Tag | Files producing scenes |
|---|---|
| `@all` | `capture.spec.ts`, `estimating-shot.spec.ts` |
| `@theming` | `avatar-color.spec.ts`, `capture.spec.ts`, `estimating-shot.spec.ts`, `vote-bars-shot.spec.ts` |
| `@layout` | `agenda-states.spec.ts`, `capture.spec.ts`, `estimating-shot.spec.ts`, `keyboard-shortcuts.spec.ts`, `vote-bars-shot.spec.ts`, `vote-dots-196.spec.ts` |
| `@participants` | `agenda-states.spec.ts`, `avatar-color.spec.ts`, `participant-cap.spec.ts`, `participants.spec.ts` |
| `@viewer` | `participants.spec.ts` |
| `@host` | `agenda-states.spec.ts`, `participants.spec.ts`, `session-ended.spec.ts`, `skip-round.spec.ts` |
| `@password` | `password-flow.spec.ts` |
| `@reveal` | `reveal-transition.spec.ts`, `vote-bars-shot.spec.ts` |
| `@skip` | `skip-round.spec.ts` |
| `@history` | `room-history.spec.ts`, `round-history.spec.ts` |
| `@scale` | `vote-dots-196.spec.ts` |
| `@connection` | `capture.spec.ts`, `connection-states.spec.ts` |
| `@session-end` | `session-ended.spec.ts` |
| `@home` | `capture.spec.ts`, `room-history.spec.ts` |
| `@onboarding` | `keyboard-shortcuts.spec.ts` |

### Scene index (Phase 1)

| File | Scenes |
|---|---|
| `capture.spec.ts` | Onboarding, home, home overflow, settings page, join page, lobby, session-settings sheet, scale picker, access picker, QR modal, lobby overflow, round-start modal, estimating, estimating w/ card selected, lobby results, custom scale editor, preset toggle, round-history empty, empty home, connection chip offline + reconnected |
| `password-flow.spec.ts` | password sheet on join; wrong-password reject |
| `reveal-transition.spec.ts` | pre-reveal all-voted; post-reveal lobby |
| `skip-round.spec.ts` | host skip action; lobby skipped row; suppressed pre-skip votes |
| `round-history.spec.ts` | populated history; departed-name resolution |
| `participants.spec.ts` | viewer role badge + toggle; swipe-kick (mobile); leave-session confirm |
| `participant-cap.spec.ts` | 4th joiner vs `HNCH_ROOM_CAP=3` → close 4006 |
| `session-ended.spec.ts` | joiner-side toast on host's End Session |
| `connection-states.spec.ts` | sustained disconnected (≥5,500 ms) |
