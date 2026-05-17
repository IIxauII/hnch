# Vote distribution bars (issue #123)

Proportional bars in revealed round results. Pure derived state, no schema/relay/ADR work.

## Decisions

- **Design: B (row-background fill).** Tinted bar spans the `.group` row width = `count/totalVoted * 100%`. Chips render on top. No extra vertical space vs. design A (thin bar under count).
- **Color tokens.** Plurality group: `--ion-color-primary` at ~12% alpha. Other vote groups: same at ~6%. Keeps chip contrast intact in both themes.
- **Denominator.** `Object.keys(round.votes).length` — cast votes only. Excludes "Didn't vote". Future abstain entries will be filtered upstream once that feature lands; no change required here.
- **No bar on:** `Didn't vote` group, future `Abstained` group.
- **Reduced motion.** No width transition. Static render only — bar present immediately, no animation.
- **CLI.** Out of scope this PR. Follow-up PR `feat(cli): proportional bars in results table` once client is merged.

## PR breakdown

| # | Worktree | Scope | Branch |
|---|----------|-------|--------|
| 1 | `hnch-vote-bars` | `feat(client)`: VoteResultsComponent row-fill bars + tests | `vote-bars` |
| 2 | _follow-up_ | `feat(cli)`: text-art bars in Ink results table | TBD after PR 1 lands |

## Acceptance (this PR)

Matches issue #123 AC 1–8, 10. AC 9 (CLI) deferred to PR 2.

## Implementation notes

- Add `totalVoted = Object.keys(round.votes).length` computed signal.
- Add `widthPct(group)` returning `count / totalVoted * 100`.
- Template: `<ion-item-group class="group" [class.plurality]="$first" [style.--bar-width.%]="widthPct(group)">`.
  - `$first` works because `voteGroups()` is sorted count desc; ties tie-break by `scaleIndex` — first group is canonical plurality. Note: tie at the top would still color only one group "plurality"; this is an accepted simplification (matches issue spec — "the plurality group", singular).
- CSS: `.group { position: relative; }` and `.group::before { content: ''; position: absolute; inset: 0; width: var(--bar-width, 0%); background: var(--ion-color-primary); opacity: 0.06; border-radius: 0.5rem; z-index: 0; pointer-events: none; }`. `.group.plurality::before { opacity: 0.12; }`.
- Existing `.group-header` and `.chips` need `position: relative; z-index: 1;` so they sit above the bar.
- `.didnt-vote::before` suppressed (set `display: none` or omit by class guard).
