# Votes can land on a terminated round; the toggle rule is written four times

**Status:** Draft
**Date:** 2026-08-23
**Source:** free idea — architecture review, candidate 2 (`/improve-codebase-architecture` → `/grilling`, this session)

## Problem

A vote can be recorded against a round that has already been skipped or discarded. The writer that stores a vote refuses only *revealed* rounds, but a round has three terminal states since ADR-0046. The "current round" a client hands that writer falls back to the last non-discarded round when nothing is active, so a terminated round is exactly what it returns once the host ends the last one.

The CLI hits this directly: it applies no check of its own, so a keypress arriving after the host skips is stored. The mobile client is partly covered — its keyboard handler checks that the round is still open — but a card tap and the abstain button do not. Those two are protected only by a navigation effect racing the tap, which is why the defect has not surfaced in practice.

Separately, one rule — *tapping the card you already voted for clears your vote* — is written out in four places across the two clients. Each is a correct copy today. There is no single place to change it.

A related gate (viewers must not vote) is **not** currently leaking: both clients hide the card picker from viewers entirely. Folding it into the same place is defence in depth against a mid-round role flip, not a bug fix, and should not be described as one.

## Users

- **Voter** — primary actor. Casts, changes, clears, and abstains. Affected on both mobile and CLI.
- **CLI user** — the only one who can hit the defect today without racing an animation.
- **Viewer** — indirectly: a participant who flips from voter to viewer mid-round leaves a vote behind, and must still be able to remove it.
- **Host** — unaffected as an actor; the host's skip/discard is what creates the window.

## Current behavior

Visual baseline for the surfaces this touches:

https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/keyboard/02-estimating-digit1-cast.png?raw=true
https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/keyboard/03-estimating-arrow-focused.png?raw=true
https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/skip/skip-02-lobby-skipped-state.png?raw=true

- Mobile: card grid renders against the current round and stays on screen for the moment between the round going terminal and the auto-navigation firing.
- Mobile keyboard: digits cast, re-pressing the digit for your current vote clears, arrows move focus, Enter/Space commits.
- CLI: arrows navigate, Enter selects (re-selecting clears), Backspace/Delete clears, `[a]` toggles abstain.

## Proposed behavior

**Voting on a terminated round is refused, in both clients.**
Once a round is revealed, skipped, or discarded, no vote, vote change, clear, or abstain is recorded against it — regardless of which input the participant used, and regardless of which client they are on. A refusal is silent: no toast, no error, nothing appears to happen.

**Nothing a participant can do today changes.**
- Tapping the card you already voted for still clears it.
- Re-pressing the digit bound to your current vote still clears it.
- Enter/Space on your already-selected card still clears it.
- CLI Enter on your already-selected card still clears it; Backspace/Delete still clears.
- `[a]` still toggles abstain on and off.

These are preserved end to end. The rule simply lives in one place instead of four.

**The mobile card grid disappears the instant the round terminates.**
Today it lingers for a tick while the navigation effect catches up. After this change the grid is bound to "is there a round still open", so the affordance vanishes at the same moment the write starts being refused. The navigation to Lobby is unchanged.

**A participant who becomes a viewer mid-round can still remove their vote.**
Casting requires being a voter. Clearing does not — otherwise a role flip strands a vote in the tally with no way to withdraw it.

**Refusals are distinguishable to callers.**
A caller can tell "there was nothing open to vote on" from "you are not a voter", and can tell whether a toggle cast or cleared. Nothing surfaces this to the user today; it exists so behavior is assertable and so a future affordance has something to read.

## Success criteria

- A vote arriving after the host skips or discards the round does not appear in that round's votes on any client, on any input path.
- Recording a vote after a round is revealed remains impossible (unchanged).
- Every input listed under "Nothing a participant can do today changes" behaves identically before and after.
- On mobile, the card grid is gone as soon as the round is terminal, with no interactive frame in between.
- A voter who switches to viewer mid-round can clear their own vote, and cannot cast a new one.
- The toggle rule can be changed in one place and both clients follow.
- Existing e2e specs `vote-change`, `keyboard-vote`, and `abstain-round` pass unchanged.

## Scope

**In:**
- One shared place that decides whether a vote may be recorded, applied by both clients.
- The terminal gate widened from "revealed" to all three terminal states.
- The toggle rule collapsed from four copies to one.
- The viewer check folded into the same place (defence in depth).
- Mobile card grid bound to "round still open".
- CLI vote surface renamed to match the shared vocabulary, down to the picker component.
- Unit coverage for the gates and the toggle, colocated with the new module; existing suites pruned where they now duplicate it.

**Out (explicit anti-goals):**
- No new e2e spec — unit coverage is deemed sufficient for the closed gap.
- No Backspace/Delete clear added to the mobile client (CLI keeps its own).
- No user-visible feedback on a refused vote.
- No change to how reveal/skip/discard themselves are gated.
- No `CONTEXT.md` entry and no ADR — module docstrings carry the vocabulary, as `round-transitions` does.
- No change to what "current round" means for the Lobby results view.
- Not touching the other candidates from the review (host-authority commands, session-exit consolidation).

## Open questions

None. Every decision was settled in the grilling session that produced this spec; the pre-decided shape is recorded below so `/plan` does not reopen it.

## Settled design (input for `/plan`)

> Recorded against this skill's usual "no implementation detail" rule, deliberately: these are not suggestions for the planner to evaluate, they are decisions already taken and confirmed. `/plan` should sequence and verify them, not re-decide them.

**`packages/shared`**
- `doc-projection.ts` — add exported `activeRound(p: DocProjection): Round | null` beside `currentRound`. `currentRound` keeps its anchor fallback unchanged; the Lobby results view depends on it.
- `round-commands.ts` — rename its private `activeRound(doc)` to `activeRoundOrRefusal(doc)` to clear the name clash. Otherwise untouched: `TerminalResult` keeps both `'no-current-round'` and `'already-terminal'`.
- new `vote-commands.ts`:
  ```ts
  type VoteResult =
    | { applied: true; effect: 'cast' | 'cleared' }
    | { applied: false; reason: 'no-active-round' | 'not-a-voter' }

  toggleCurrentVote(doc, participantId, card): VoteResult  // gates: active round + voter role
  clearCurrentVote(doc, participantId): VoteResult         // gates: active round only
  ```
- `index.ts` — drop raw `castVote` / `clearVote` from the barrel, per the #472 precedent documented at `index.ts:6-11`. They stay `export`ed from `doc-projection.ts` so `vote-commands` and the colocated writer tests import them by path.
- **Accepted trade-off:** `vote-commands` and `round-commands` deliberately carry different refusal vocabularies (collapsed vs split). This is a decision, not an oversight.

**`packages/client`**
- `doc.service.ts` — delete the `castVote` / `clearVote` passthroughs (`:635-641`); add `toggleCurrentVote(pid, card)` and `clearCurrentVote(pid)` returning `VoteResult`; add an `activeRound` signal.
- `estimating.page.ts` — card grid binds `activeRound()`; `onCardTap` (`:672`) and `onAbstain` (`:761`) each collapse to one `toggleCurrentVote` call; the `case 'clear'` dispatch (`:743`) is deleted. The autoNav effect still reads `currentRound` — it must see the terminal round.
- `estimating.keyboard.ts` — both `if (myVote === card) return { kind: 'clear' }` branches return `cast` instead. **The `myVote` param stays**: it feeds `indexOfVote` for arrow-nav start (`:70`) and the Enter/Space fallback target (`:88`). `KeyAction` loses its `'clear'` variant (unreachable — the client has no Backspace path). `shouldHandleKeyEvent` keeps both `roundActive` and `isViewer`.

**`packages/cli`**
- `session.ts` — `SessionHandle.vote` / `.unvote` become `toggleCurrentVote(card): VoteResult` / `clearCurrentVote(): VoteResult`, delegating to the shared commands.
- `App.tsx`, `Voting.tsx`, `CardPicker.tsx` — props renamed to `onToggleCurrentVote` / `onClearCurrentVote` down to the leaf.
- `CardPicker.tsx` — toggle body deleted (`:29-35`); Enter emits toggle intent, Backspace/Delete still clears.
- `Voting.tsx` — the abstain toggle (`:73-79`) collapses to one `onToggleCurrentVote(ABSTAIN_SENTINEL)` call.

**Tests** — new colocated `packages/shared/src/vote-commands.test.ts` (active gate, role gate, toggle cast→cleared→cast, abstain sentinel via toggle, viewer may clear but not toggle). Prune at source: `doc-projection.test.ts` vote sections shrink to raw-writer coverage; `estimating.keyboard.test.ts` drops its digit-re-press-clears matrix; `doc.service.test.ts` and `cli/session.test.ts` updated for the pair swap and rename.

**Shipping** — three phases, each green on its own:
1. `shared`: `activeRound`, `vote-commands`, the rename, tests. Nothing wired.
2. `client` + `cli`: migrate onto the pair, delete the four toggles.
3. `index.ts`: drop the raw writers from the barrel.

## ADR impact

None. ADR-0046 (three terminal fields), ADR-0040 (skip), ADR-0041 (abstain sentinel) and ADR-0020 (voter/viewer role) all stand unchanged — this makes the code match what they already say. Per `adr/README.md`, implementation of an already-decided architecture is below the ADR bar.

## References

- `adr/0046-round-discard-tombstone.md` — the three terminal fields the vote writer predates
- `adr/0040-skipped-rounds.md`, `adr/0041-per-round-abstain-sentinel.md`, `adr/0020-participant-viewer-voter-role.md`
- `CONTEXT.md` — *active* (round), *round command*, *TerminalResult*
- PR #472 — the terminal-seam deepening this follows; its barrel precedent is quoted at `packages/shared/src/index.ts:6-11`
- PR #471, #469, #465, #460 — the same deepening run

## Screenshot scope (suggested)

`keyboard` and `skip` are the affected scenes; both should be unchanged by this work, so they serve as regression baselines rather than new coverage. `/plan` is the authority on tags.
