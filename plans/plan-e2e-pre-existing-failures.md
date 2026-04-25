# Plan: triage pre-existing e2e failures (post plan-e2e-fixes follow-up)

**Status:** open — triage required
**Discovered:** 2026-04-25 during plan-e2e-fixes verification
**Baseline:** confirmed failing on `c091a7e` (gap-closure commit) via `git stash` reproduction
**Suite state at handoff:** 47/52 chromium pass, 5 pre-existing failures stable across runs

## Context

`plan-e2e-fixes` (closed 2026-04-25) addressed the 9 originally-triaged failures from initial researcher-runs report. Final verification surfaced 5 additional failing specs that were **already broken on baseline** before that plan began — confirmed via clean reproduction on `git stash`. They were excluded from `plan-e2e-fixes` scope per the original triage.

This plan exists to triage and fix those 5.

## Failing tests

| Spec | Test name | Notes |
|---|---|---|
| `revote-cycle.spec.ts` | re-vote from results → estimating → vote → reveal shows Round 2 | re-vote flow round transition |
| `revote-cycle.spec.ts` | re-vote preserves title and does not affect prior round | round lineage / parentRoundId preservation |
| `three-client.spec.ts` | host election: after host drops, exactly one remaining player becomes host | 3-participant election convergence |
| `three-client.spec.ts` | host election: elected host can reveal votes after original host drops during round | post-election authority transfer |
| `voting-flow.spec.ts` | both clients vote and votes remain hidden | pre-reveal vote concealment |

## Reproduce

```bash
pnpm --filter @hnch/e2e exec playwright test revote-cycle three-client voting-flow --project=chromium --reporter=line --timeout=15000
```

To confirm pre-existing-on-baseline:

```bash
git stash
pnpm --filter @hnch/e2e test --project=chromium  # 5 same failures present
git stash pop
```

## Hypothesis space

Not yet investigated. Candidates worth exploring:

- **revote-cycle** — re-vote was added in c091a7e; tests may have shipped against incomplete impl, or `parentRoundId` lineage broke when round-titles + viewer/voter roles landed in c40acd5. Check `RoundService` / `DocService.startRevote` if it exists.
- **three-client** — host election with 3 participants. Election logic per ADR-0010 has 5-second debounce; check if test waits long enough OR if election with 3 voters has a different code path than the 2-voter case `host-election.spec.ts` covers (which does pass).
- **voting-flow** — votes hidden until reveal. Touched by viewer/voter role split (c40acd5)? Could be a regression from role-aware vote rendering.

## Suggested approach

1. Spawn researchers (haiku) per spec to capture exact error message + last-action-before-failure from a fresh run, plus `git log -p` on the spec file to see when the assertion was added vs when surrounding impl shipped.
2. Triage: which are real client bugs vs test design flaws (cf. T6+T7 in plan-e2e-fixes where the test's setup triggered unanimous auto-reveal).
3. Group by area (re-vote logic, host election, vote concealment).
4. Plan stories per area.

## Acceptance

- [ ] AC-1: All 5 specs pass.
- [ ] AC-2: `pnpm --filter @hnch/e2e test` chromium green 52/52, 2 sequential runs.
- [ ] AC-3: 15s per-test timeout preserved.
- [ ] AC-4: No regressions to the 47 currently passing specs.

## Out of scope

- Webkit + Firefox projects (Playwright config has all 3, plan-e2e-fixes only verified chromium).
- Pre-existing baseline failures discovered later that aren't in this list.

## References

- `plans/plan-e2e-fixes.md` — predecessor plan that fixed the 9 originally-triaged failures.
- ADR-0010 — host election (5s debounce + lowest-peer-ID).
- ADR-0013 — round lineage with `parentRoundId` for re-vote.
- ADR-0018 — manual reveal + unanimous auto-reveal.
