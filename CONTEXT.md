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
