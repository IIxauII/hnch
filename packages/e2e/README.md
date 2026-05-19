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

### Tag catalog (forward-ref to Phase 4)

Per scene/`test()`, annotate with Playwright tags so `.screenshot-tags` can narrow capture to relevant subsets. Catalog (final list defined in Phase 4 of the plan):

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

`.screenshot-tags` (repo root, gitignored) — one regex like `@participants|@viewer` — is read by `scripts/screenshot-publish.mjs` and translated into `--grep`. Empty/missing = full suite.

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
