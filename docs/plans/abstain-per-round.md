# Plan: per-round abstain action (issue #120)

Status: drafted 2026-05-16. ADR-0041 (Proposed) captures the decision; this doc maps the rollout.

## Goal

Voters can abstain from a single round. Abstain = explicit, written to `round.votes` as sentinel `hnch_abstain`. Counts as "voted" toward avatar-row state but excluded from unanimous auto-reveal denominator. Results show three groups: voted / abstained / didn't vote.

## Phases

Each phase ships as its own PR in its own `pnpm worktree:add` worktree. Run `git fetch origin` before adding each worktree.

### Phase 0 — ADR (done)

- `adr/0041-per-round-abstain-sentinel.md` — Proposed.
- Gate: ADR moved to Accepted before Phase 1 merges.

### Phase 1 — shared sentinel + CustomScale guard

Scope: `packages/shared`.

- Export `ABSTAIN_SENTINEL = 'hnch_abstain'`.
- Export `isAbstainVote(card: string): boolean`.
- CustomScale validator/schema rejects exact-match `hnch_abstain` as a card label.
- Unit tests: sentinel constant value frozen; type guard; CustomScale rejection.

PR title: `feat(shared): per-round abstain sentinel + CustomScale guard`.

### Phase 2 — client UI + auto-reveal denominator

Scope: `packages/client` (+ `packages/shared` only if a vote-state helper moves to shared).

- `EstimatingPage`: full-width muted "Abstain this round" button below card grid for `role: voter`.
- Tap → writes `ABSTAIN_SENTINEL` to `round.votes[selfId]`. Grid dims to ~40% opacity. Abstain button shows active state.
- Tap any card while abstained → clears abstention, casts that vote, grid returns to full opacity.
- Avatar row: abstainers render as filled (voted), indistinguishable pre-reveal.
- Unanimous auto-reveal check: filter `round.votes` entries by `!isAbstainVote(value)` before "all online voters present" comparison. Denominator excludes abstainers.
- `VoteResultsComponent`: render "Abstained" muted group between vote-value groups and "Didn't vote".
- Unit + component tests cover: tap flow, dimmed state, card-tap-clears-abstain, auto-reveal fires with mix of voted+abstained, results grouping.

PR title: `feat(client): per-round abstain action + auto-reveal denominator update`.

### Phase 3 — CLI parity

Scope: `packages/cli`.

- Voting screen: `[a]` keybind writes `ABSTAIN_SENTINEL` to `round.votes`.
- Visual: dimmed card list, abstain hint visible until a card key clears the abstention.
- Results table: distinct "Abstained" row between voted groups and didn't-vote.
- Snapshot tests + Ink interaction tests.

PR title: `feat(cli): abstain keybind + results row`.

### Phase 4 — e2e

Scope: `packages/e2e`.

- Spec: voter abstains → second client observes Abstained group post-reveal.
- Spec: 2 voters online, 1 abstains, 1 votes → auto-reveal fires.
- Spec: re-vote round opens fresh (no inherited abstain).
- Spec: CustomScale form rejects card label `hnch_abstain`.

PR title: `test(e2e): per-round abstain coverage`.

## Cross-cuts

- Commit scopes: per phase. No multi-scope unless an unexpected `packages/shared` change rides along with Phase 2.
- Conventional Commits: `feat` for phases 1–3, `test` for phase 4.
- semantic-release: each phase produces its package's bump.
- No relay changes any phase.

## Risks

- Auto-reveal denominator change is the load-bearing logic edit. Phase 2 tests must cover: zero abstainers (regression), all abstain (edge), mix.
- CustomScale guard is belt-and-suspenders; sentinel is the contract. Don't let guard logic leak into hot paths.
- CLI dimming in Ink: terminal color support varies. Pick a portable dim style.

## Open follow-ups

- Per-session abstain preference: out of scope (ADR-0041 §10).
- Abstain reason/notes: out of scope.
- Host-initiated abstain: out of scope.
