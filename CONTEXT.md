# hnch — Context

Shared vocabulary for hnch's domain. Architecture vocabulary (module, interface, seam, depth) lives in the team's review conventions; this file names the *domain* concepts so code, docs, and reviews use one word per thing.

## Round projection

**Round**:
The projection-side view of a round — the shape `projectDoc` emits and every reader (client, CLI) consumes. Carries a resolved `status` and `terminalAt`; never exposes the raw terminal timestamps.
_Avoid_: RoundView, RoundSnapshot, RoundDTO

**StoredRound**:
The doc-side shape of a round as written to the Yjs `Y.Map` — the raw fields `revealedAt` / `skippedAt` / `discardedAt` and the rest. Internal to `packages/shared`'s writer and projection paths; readers never see it.
_Avoid_: RawRound, RoundRecord, RoundDoc

**status** (`RoundStatus`):
A round's resolved lifecycle state on the projection `Round`: `'pending' | 'voting' | 'revealed' | 'skipped' | 'discarded'`. The single field readers branch on. Computed once in `projectRound`.
_Avoid_: state, phase, roundState

**terminalAt**:
The resolved timestamp of a round's winning terminal event (Unix ms), present on the projection `Round` only when `status` is `'revealed' | 'skipped' | 'discarded'`. Source for elapsed-time display so readers never reach for a raw terminal field.
_Avoid_: revealedAt (on the projection side), endedAt, closedAt

**terminalState**:
The internal helper that resolves `StoredRound`'s three raw terminal timestamps into one winner under the earliest-wins / reveal→skip→discard tie-break. After deepening, its only caller is `projectRound`; it is not part of the projection interface.
_Avoid_: resolveTerminal, getRoundState

**active** (round):
A round whose `status` is non-terminal (`pending | voting`) — still open to votes and to a terminal transition. The complement of a terminal round. Named by the `round-transitions` module: `canEnterTerminal(status)` is "is active"; `isTerminalStatus(status)` is its complement. Both writers (terminal-mutex guard, via `terminalState`) and readers (UI affordances, pre-mutation gates in client + CLI) branch on this one split instead of re-spelling `'pending' || 'voting'`.
_Avoid_: open, live, current (the selector for this predicate is `activeRound`; `current` names the *anchor* selector `currentRound`, which falls back to the last non-discarded round and so must never gate a write)

## Round commands (writer side)

**round command**:
A shared writer-side action that fires a round's terminal transition on the *current* round — `revealCurrentRound` / `skipCurrentRound` / `discardCurrentRound` in the `round-commands` module. Each selects `currentRound`, applies the `canEnterTerminal` gate, stamps the clock (injectable, default `Date.now`), then delegates to the low-level `doc-projection` writer. The single terminal seam both client and CLI call; after deepening, the raw writers (`revealRound` / `skipRound` / `discardRound`) are internal to `packages/shared` and drop out of the barrel.
_Avoid_: terminalAction, roundAction, mutation (for the command specifically)

**TerminalResult**:
The return of a round command: `{ applied: true; at } | { applied: false; reason: 'no-current-round' | 'already-terminal' }`. Lets a caller branch on whether the transition actually fired — e.g. suppress haptics or celebration on a no-op — without re-spelling the gate. Replaces the previous throw-on-illegal-transition behavior; a lost race (two peers terminating the same round) no-ops instead of throwing.
_Avoid_: CommandResult, RevealResult, void (the command never returns bare void)

## Session drivers

**driver**:
A shared module that owns *when* a rule re-evaluates, not just what the rule says — `startElection` in `election` and `startAutoReveal` in `auto-reveal`. Each takes framework-free callbacks (`projection`, `onlineIds`, `subscribe`, plus the rule's own sink) and returns a handle with `stop()`; no `Y.Doc`, `Awareness`, or Angular primitive crosses that seam. Client and CLI supply adapters, nothing more. Naming a driver separately from its predicate matters because the re-evaluation axis is exactly where two hand-wired copies drift.
_Avoid_: watcher, observer (Yjs owns that word), loop, poller (a driver is subscription-fed, never polls), service

**auto-reveal driver**:
The `startAutoReveal` half of the `auto-reveal` module: subscribes to projection *and* awareness changes, applies `shouldAutoReveal` to `currentRound`, and calls the adapter's `reveal()`. Session-scoped in both surfaces — a peer counts toward the unanimous denominator regardless of which screen it is on, so it checks regardless too. Holds no per-round state: the predicate's terminal guard makes a dedupe set unnecessary. Every peer runs one and any peer may write (ADR-0018 assigns no host authority).
_Avoid_: autoRevealWatcher, revealPoller, unanimityService

**autoRevealCount**:
The client-side monotonic counter `DocService` bumps when its auto-reveal driver's write actually applies. An edge signal, not a timestamp — two reveals in the same millisecond must still notify, and there is nothing to reset. The Estimating page keys its success haptic off it, which is how device feedback stays out of the doc layer.
_Avoid_: lastAutoRevealAt, autoRevealed, revealSignal
