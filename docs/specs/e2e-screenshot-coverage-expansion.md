# E2E screenshot coverage expansion

**Status:** Draft
**Date:** 2026-05-19
**Source:** [#265](https://github.com/IIxauII/hnch/issues/265)

## Problem

The existing screenshot harness — `packages/e2e/tests/_screenshots/capture.spec.ts` plus a handful of per-feature specs — covers the happy-path tour (onboarding → home → join → lobby → estimating → results) at desktop (1440) and mobile (390), dark mode only. Roughly **40–50% of shipped UI states** have committed capture specs.

PR reviewers asked to evaluate UX changes against states like password-reject, skip, viewer role, kick swipe, session-ended toast, or empty home have no canonical screenshots to compare against. Authors hand-roll one-off captures per PR (see `_screenshot-host-actions.spec.ts`) or skip visual review entirely.

## Users

- **PR reviewers** — need committed reference screenshots to compare visual diffs in PR comments.
- **PR authors** — need a deterministic way to regenerate the relevant scene PNGs for a changed feature and commit them to the PR branch.

(End users of hnch are unaffected — this is internal review tooling.)

## Proposed behavior

After this ships, every UI state listed below has a committed Playwright spec that captures it as a PNG when invoked with the established opt-in env var. Authors editing a feature run the matching spec, commit the regenerated PNGs to their PR branch under the project's screenshot convention, and link them from the PR comment per `CLAUDE.md`'s screenshot guidance.

The harness remains **capture-only** — no `toHaveScreenshot()` diff assertions, no CI execution. Specs are skipped unless their opt-in env var is set, matching the current `_screenshots/*` pattern.

States to cover (all mandatory per #265):

1. **Password flow** — password entry sheet on join, wrong-password reject UI.
2. **Reveal animation + post-reveal lobby** — reveal transition frame and the freshly-revealed lobby with VoteResultsComponent populated.
3. **Skip state** — host skip action, skipped-round row in lobby, suppressed pre-skip votes.
4. **Round history** — populated `RoundHistoryComponent` list and the empty-state variant; departed-participant name resolution.
5. **Participants** — viewer role badge + toggle, host swipe-kick affordance, leave-session confirm, participant-cap reject screen.
6. **Custom scale editor** — `CustomScale` create/edit UI and `PresetOverrides` toggle UI.
7. **Session-ended toast** — broadcast banner shown on non-host clients.
8. **Reconnect / offline** — `ConnectionChipComponent` disconnected and reconnecting states.
9. **Empty home** — first-run-after-onboarding home with no last-session card and no teams.

## Success criteria

- Every state in the list above has a committed Playwright spec under `packages/e2e/tests/_screenshots/` (existing pattern) that writes its PNGs when its opt-in env var is set.
- Each spec is documented in its header comment with the exact invocation command and the output directory.
- A reviewer can identify, for any of the nine states, the single spec file that produces its reference screenshot.
- Running the full e2e suite without the opt-in env vars does **not** execute these specs (existing skip pattern preserved).

## Scope

**In:**
- Adding new `_screenshots/*.spec.ts` files and/or extending `capture.spec.ts` for the nine states above.
- Matching the existing opt-in env var convention (`SCREENSHOT_CAPTURE=1` or per-spec equivalent).
- Capture-only — `page.screenshot({ path })` to a local output dir.
- Dark mode at the same two viewports already used (1440 desktop, 390 mobile) unless a state is intrinsically platform-specific.

**Out (explicit anti-goals):**
- Light-mode capture — `capture.spec.ts` hardcodes `colorScheme: 'dark'`; not changing that here.
- Tablet / intermediate viewport coverage.
- Visual-regression assertions (`toHaveScreenshot()`, baseline management, CI diff gates).
- Running screenshot specs in CI.
- Native iOS/Android shell captures (Phase 6b territory).
- Reorganizing or normalizing the existing inconsistent output-dir convention (some specs use `<sha>` subdirs, others don't) — out of scope unless a new spec needs a new dir.

## Open questions

- **Output directory:** existing specs write to `.claude/screens/...` (gitignored). #265 says reviewers need PNGs **committed to the PR branch**. Should new specs default to `docs/screenshots/<topic>/` (per `CLAUDE.md` PR-screenshot guidance) instead of `.claude/screens/`? Or keep `.claude/screens/` as the spec output and have authors copy/commit selected frames into `docs/screenshots/<topic>/` per PR? `/plan` should resolve.
- **Spec file granularity:** how to split the nine states across `capture.spec.ts` extensions vs new per-feature specs. Reveal/skip/post-reveal/empty-home arguably fit the tour spec; password-reject/cap-reject/custom-scale/participants/session-ended/connection-states arguably warrant focused files (matching `vote-bars-shot`, `host-actions`, etc.). `/plan` decides per state.
- **Cap-reject + session-ended capture mechanics:** these require multi-client orchestration (cap-reject needs 4 concurrent peers against `HNCH_ROOM_CAP=3`; session-ended needs a host-write observed from a joiner). Feasible inside Playwright — but may require new fixture helpers. `/plan` flags.
- **Connection-state capture:** simulating disconnected/reconnecting without flake. Playwright supports `context.setOffline(true)` — confirm `ConnectionChipComponent` reacts to it in test env, or whether a forced WS close is needed.

## ADR impact

None. This is a pure test-tooling addition. The captured UI states all derive from already-accepted ADRs (referenced for traceability):

- ADR-0017, ADR-0035 — password flow / WS close 4002
- ADR-0018 — reveal mechanics
- ADR-0019 — scales & custom scales
- ADR-0020 — participant roles
- ADR-0023 — session-ended broadcast
- ADR-0024 — participant cap / close 4006
- ADR-0025 — reconnect backoff
- ADR-0040 — skip semantics

## References

- Issue: [#265](https://github.com/IIxauII/hnch/issues/265)
- Existing tour spec: `packages/e2e/tests/_screenshots/capture.spec.ts`
- Existing per-feature specs: `packages/e2e/tests/_screenshots/{avatar-color,vote-bars-shot,vote-dots-196,agenda-states,keyboard-shortcuts,estimating-shot}.spec.ts`, `packages/e2e/tests/_screenshot-host-actions.spec.ts`
- Screenshot commit convention: `CLAUDE.md` → "PR screenshots"
