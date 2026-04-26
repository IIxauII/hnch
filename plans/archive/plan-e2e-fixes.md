# Plan: E2E test stabilization (root-cause fixes)

**Estimate:** 13 story points
**Status:** approved 2026-04-25

## Context

`pnpm --filter @hnch/e2e test` (chromium) shows 9/52 deterministic failures after gap-closure (c091a7e + c869b8d + c40acd5). Initial diagnosis pointed to timeouts; round-3 research overturned that. Most "failing" specs (host-election, password-room, vote-change, qr-display) PASS in isolation — suite-level breakage is **test bleed**. The genuinely broken specs (auto-reconnect, end-session, app-settings) reveal three real client bugs and one test-infra gap.

No timeout changes. We fix the bugs.

## Root-Cause Map

| Failure | Root cause | Layer |
|---|---|---|
| end-session L58 strict-mode (3 toasts) | Toasts never dismissed on route nav (`duration=0`, no cleanup hook) | client bug |
| auto-reconnect L118 strict-mode (2 reconnect toasts) | Same toast leak | client bug |
| auto-reconnect L5 (toast `overlay-hidden`) | `sync-provider` listens only to `ws.onclose`; Chromium offline mode may not close socket immediately | client gap |
| auto-reconnect L63 (joiner /join → never /estimating) | Reconnect rehydration regression | client bug |
| app-settings × 5 ("Target page closed" on scale-picker radio click) | Scale-picker modal lifecycle bug | client bug |
| host-election / password-room / vote-change / qr-display | Pass alone, fail in suite → IndexedDB / localStorage carryover | test infra |

## Decisions

- **D1 Toast cleanup scope:** dismiss toasts in `ionViewWillLeave` on Lobby + Estimating only (no central ToastService refactor).
- **D2 Test toast assertions:** add `expectToast(page, /msg/i)` helper as defense-in-depth; migrate end-session + auto-reconnect.
- **D3 Scale-picker:** read trace, fix the bug. No test workaround.
- **D4 Reconnect detection:** add `window` online/offline listeners in `sync-provider` — fixes prod behavior and the test.
- **D5 Joiner rehydration:** read trace, fix nav stall.
- **D6 Test bleed:** fixture clears `localStorage` + IndexedDB before each Participant's first nav. No `reuseExistingServer=false`.

## Acceptance Criteria

- [ ] AC-1: `pnpm --filter @hnch/e2e test` chromium 52/52 passes 2 sequential runs.
- [ ] AC-2: 15_000ms per-test timeout unchanged in `playwright.config.ts`.
- [ ] AC-3: Lobby + Estimating dismiss open toasts on route leave.
- [ ] AC-4: `sync-provider` responds to `window 'offline'` event with reconnecting state.
- [ ] AC-5: Scale-picker selection no longer closes page (app-settings 5 specs pass).
- [ ] AC-6: Joiner reconnect rehydration navigates to active round screen.
- [ ] AC-7: Fixtures clear localStorage + IndexedDB per test; specs that pass-alone also pass-in-suite.

## Stories

### Story 1 — Toast lifecycle fix
- **T1** [mobile-sonnet] Track `toastController.create()` results in Lobby; dismiss + clear on `ionViewWillLeave`. File: `packages/client/src/app/pages/lobby/lobby.page.ts`.
- **T2** [mobile-sonnet] Same pattern in Estimating. File: `packages/client/src/app/pages/estimating/estimating.page.ts`.

### Story 2 — sync-provider offline detection
- **T3** [mobile-sonnet] Subscribe to `window` `online`/`offline` events on init; dispatch state changes; clean up on destroy. File: `packages/client/src/app/services/sync-provider.ts` (or `core/doc/sync-provider.ts`).

### Story 3 — Scale-picker modal bug
- **T4** [mobile-sonnet] Diagnose. Read Playwright trace from `app-settings` L119 failure. Inspect radio change handler in `scale-picker.sheet.ts`. Document root cause.
- **T5** [mobile-sonnet] Apply minimal fix per T4. Blocked by T4.

### Story 4 — Joiner reconnect rehydration
- **T6** [mobile-sonnet] Diagnose. Read trace from `auto-reconnect.spec.ts:63`. Identify why rejoiner stays on /join despite active round.
- **T7** [mobile-sonnet] Apply minimal fix. Blocked by T6.

### Story 5 — E2E infra hardening
- **T8** [mobile-sonnet] `addInitScript` clears localStorage + deletes all IndexedDB DBs before each Participant's first nav. File: `packages/e2e/tests/app.fixture.ts`.
- **T9** [mobile-haiku] `expectToast(page, regex|string, opts?)` evaluate-based on `.message` property; default 5_000ms. File: `packages/e2e/tests/helpers.ts`.
- **T10** [mobile-haiku] Migrate `end-session.spec.ts` + `auto-reconnect.spec.ts` toast asserts to `expectToast`. Blocked by T9.

### Story 6 — Verification
- **T11** [mobile-haiku] `pnpm --filter @hnch/e2e test` chromium twice sequentially. 52/52 both runs. Blocked by T1, T2, T3, T5, T7, T8, T10.

## Build Order

S1 ‖ S2 ‖ S3 ‖ S5/T8 (parallel) → S4 (after S3 review) → S5/T9 → S5/T10 → S6/T11.

## Team

| Agent | subagent_type | Tasks |
|-------|---------------|-------|
| impl-client-A | mobile-sonnet | T1 → T2 → T3 |
| impl-client-B | mobile-sonnet | T4 → T5 → T6 → T7 |
| impl-e2e | mobile-sonnet | T8 → T9 → T10 → T11 |
| reviewer | reviewer | reviews each story when ready |

Peak concurrency: 4 (3 impl + reviewer).

## Notes for implementers

- T4 + T6 are diagnostic-first. Read `packages/e2e/test-results/.../trace.zip` before writing code.
- T3: `online`/`offline` events fire many times; idempotent state-set required.
- T8: feature-check `indexedDB.databases?.()` (unsupported in some envs); fall back to deleting known DB names.
- T1/T2: read existing toast code first. If toasts are bound declaratively via `<ion-toast [isOpen]="signal()">`, the fix is `signal.set(false)` in `ionViewWillLeave`, not imperative `dismiss()`.
- AC-1 requires 2 sequential runs to confirm bleed truly fixed.
- Do NOT change `playwright.config.ts` `timeout`. Per-spec `test.setTimeout` also forbidden — if a test legitimately needs more time, fix the underlying race instead.
