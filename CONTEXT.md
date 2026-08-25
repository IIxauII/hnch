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
_Avoid_: open, live, current (the selector for this predicate is `activeRound`; `current` names the *anchor* selector `currentRound`, which falls back to the last non-discarded round and so must never gate a **write**, a **navigation**, or a **UI affordance**. Its one legitimate reader is the results anchor — "what should the Lobby results view show". Anywhere else the anchor fallback is a blind spot: when the round in question is the only one in the session, a terminal transition to `discarded` is invisible to it.)

## Screen selection

**screen** (`Screen`):
Which of a surface's in-session screens a peer belongs on: `'lobby' | 'estimating'`. One word across three vocabularies that used to disagree — the client's routes (`/lobby`, `/estimating`), its last-session cache (`lastScreen`), and the CLI's two views. Both surfaces are adapters over this one union; neither re-derives it.
_Avoid_: view, page, route, **voting** (the CLI's old spelling — it collides with the `RoundStatus` member `'voting'`, which is a different idea entirely: a round's lifecycle state, not a destination)

**screenFor**:
The selector in the `screen-for` module that answers the screen question from a projection: an `activeRound` means `'estimating'`, otherwise `'lobby'`. Total on a projection — no null, no `loading` member, no options bag. Because it delegates to `activeRound` rather than the anchor selector, a session whose only round is discarded resolves to Lobby with no recovery effect anywhere. A peer with no projection yet is not a screen question; that pre-load `null` belongs to the consuming adapter (client: `DocService.screen`), not to the rule.
_Avoid_: deriveScreen, currentScreen, resolveScreen

## Round presentation (reader side)

**round presentation**:
The shared `round-presentation` module — the one place that turns a **Round** into display text. It owns the round's name, its chain position, its statistics and their wording, and its elapsed time (guard included). Client, CLI, and Markdown export each *bind* strings from it; none of them derives one. Concentrating the rules is what makes surface drift impossible rather than merely unlikely — the negative-timer defect (#509) existed only because the CLI held a private copy of a formatter that had clamped in shared since the day it was written. A new surface binds this module; it does not reimplement it.
_Avoid_: roundFormatters, display utils, roundView, per-surface formatter

**formatRoundLabel**:
A round's *identity* as one string: `"PROJ-42 · Auth migration"` from `ticketId` and `title`, or `null` when it has neither (the caller picks the placeholder). Answers "what is this round called".
_Avoid_: roundTitle, roundName, and — emphatically — using this name for chain position, which is what the CLI's private helper used to do

**formatRoundPosition**:
A round's *position* in its re-vote chain as one string: `"Round 1"`, or `"Round 2/3 [re-vote]"` for a re-vote. A different question from `formatRoundLabel` and therefore a different word; the two shared a name across packages until #509 and a reader could not tell from an import which they were getting. The ordinal is derived from the round's index in the rounds array — no caller passes one. The client's round history deliberately keeps its own ordinal-plus-badge split rather than binding this string, because its template styles the two independently; `formatRoundPosition` is the *string* form of the same idea.
_Avoid_: formatRoundLabel (the collision this name exists to end), roundOrdinal, lineageLabel

**roundStatsFor vs. computeRoundStats**:
`computeRoundStats(votes, scale)` is the raw statistics primitive and takes no view on abstentions — ADR-0041 leaves that to its caller. `roundStatsFor(round)` *is* that caller: it strips abstain votes, then delegates. Every surface calls the latter, so the sentinel can never surface as a mode and never skews a spread; the primitive stays on the barrel because scale behaviour is worth testing without a whole Round. A round with no votes and a round where everyone abstained both come back `null` — an absence of estimates, not an estimate.
_Avoid_: roundStats (ambiguous about which of the two), filterAbstain-then-compute at a call site

**formatRoundStats**:
The display form of `RoundStats` — same discriminant, every field a string ready to bind, `null` in / `null` out. Mean and median both carry one decimal place so the numbers on a surface read as one set. The spread *word* (`Unanimous` / `Close` / `Spread`) lives here; the spread *colour* does not — Ionic colour names are surface vocabulary and stay in the client component.
_Avoid_: statsViewModel, formatStats, spreadDisplay (the client's retired private helper)

**formatRoundElapsed**:
How long a round took, as `M:SS`, or `null` when it has no knowable duration — the `timerStartedAt` / `status` / `terminalAt` guard that used to be spelled at four call sites. Distinct from `formatElapsed(ms)` in `format-time`, which is the duration *primitive* and the single clamp point: live tickers call that directly because a ticking display has no terminal timestamp to hand a Round-shaped function. Clamping is the primitive's job and only its job — no call site clamps.
_Avoid_: elapsedLabel (that is a surface's binding, not the rule), roundDuration, formatElapsed (the primitive keeps that name)

## Round commands (writer side)

**round command**:
A shared writer-side action that fires a round's terminal transition on the *current* round — `revealCurrentRound` / `skipCurrentRound` / `discardCurrentRound` in the `round-commands` module. Each selects `currentRound`, applies the `canEnterTerminal` gate, stamps the clock (injectable, default `Date.now`), then delegates to the low-level `doc-projection` writer. The single terminal seam both client and CLI call; after deepening, the raw writers (`revealRound` / `skipRound` / `discardRound`) are internal to `packages/shared` and drop out of the barrel.
_Avoid_: terminalAction, roundAction, mutation (for the command specifically)

**TerminalResult**:
The return of a round command: `{ applied: true; at } | { applied: false; reason: 'no-current-round' | 'already-terminal' }`. Lets a caller branch on whether the transition actually fired — e.g. suppress haptics or celebration on a no-op — without re-spelling the gate. Replaces the previous throw-on-illegal-transition behavior; a lost race (two peers terminating the same round) no-ops instead of throwing.
_Avoid_: CommandResult, RevealResult, void (the command never returns bare void)

## Agenda and roster commands (writer side)

**agenda command**:
A shared writer-side action on a pre-session agenda item — `addItem` / `editItem` / `skipItem` / `cancelItem` / `moveItem` in the `agenda-commands` module. Same shape as a round command: take the doc, apply the gate, stamp the injectable clock where a timestamp is actually persisted, delegate to the low-level `doc-projection` writer. Short-named because the module is the noun. Carries **no authority gate** — no host rule exists on agenda edits, and the Lobby gates its affordances itself. Consumption is not a command: an item becomes `consumed` inside the round-terminal writer (ADR-0045), with no caller-driven act to gate.
_Avoid_: agendaMutation, agendaAction, addAgendaItem (on the command specifically — the writer owns that name)

**roster command**:
A shared writer-side action on who is in a session, what they are called, and who is in charge — `rename` / `recolor` / `toggleRole` / `leave` / `rejoin` / `kick` / `handoffHost` / `promoteHost` / `endSession` in the `roster-commands` module. `kick`, `handoffHost` and `endSession` gate on host authority; the rest act on the caller's own record. After deepening, every host write goes through this module — which is what `patchSettings`' narrowed public parameter type enforces (see `PublicSettingsPatch`).
_Avoid_: participantCommand, memberCommand, rosterMutation

**leave vs. rejoin**:
Two halves of one departure. `leave` stamps `leftAt` / `removedBy` so the roster stops counting a participant; `rejoin` deletes both so it counts them again. Deleting rather than stamping an "active" flag is what makes `rejoin` win: absence is what the projection reads as active, and a delete applied after the relay snapshot outranks the snapshot's `set('leftAt', …)` in the LWW merge (ADR-0036 §6). That is why both surfaces call it from `connectToRelay`'s `onSynced` and nowhere else.
_Avoid_: unleave, restore, reactivate, clearLeftAt (names the field, not the act)

**handoffHost vs. promoteHost**:
Two names for one doc write, deliberately kept apart. `handoffHost` is a host *delegating*: it needs authority and an online target, because handing the room to someone who cannot act on it strands it. `promoteHost` is a leaderless room *repairing itself*: the ADR-0048 election has already picked a winner and there is by definition no current host to authorise the write, so it is ungated. Naming them apart is what allows the gate to exist on one and not the other.
_Avoid_: setHost, transferHost, becomeHost (all three collapse the distinction the gate depends on)

**AgendaResult**:
The return of an agenda command: `{ applied: true; id; at? } | { applied: false; reason: 'not-found' | 'not-pending' | 'invalid-fields' }`. `at` is optional because only `addItem` persists a timestamp. The refusals replace throw-on-illegal-state: a host editing an item a peer just cancelled has lost a race, not written a bug, and the client keeps the edit modal open on `applied: false` rather than dismissing it.
_Avoid_: AgendaCommandResult, ItemResult, void

**RosterResult**:
The return of a roster command: `{ applied: true; at? } | { applied: false; reason: 'not-found' | 'not-host' | 'not-online' | 'self-target' }`. `at` is present only where a timestamp is persisted (`leave` / `kick` write `leftAt`; `endSession` writes `sessionEndedAt`). Each command documents the subset of reasons it can actually return — the union is one per module, matching `TerminalResult`, not one per command.
_Avoid_: ParticipantResult, HostResult, boolean

## Session drivers

**driver**:
A shared module that owns *when* a rule re-evaluates, not just what the rule says — `startElection` in `election` and `startAutoReveal` in `auto-reveal`. Each takes framework-free callbacks (`projection`, `onlineIds`, `subscribe`, plus the rule's own sink) and returns a handle with `stop()`. Because a driver is fed a *reading* of the doc rather than the doc itself, no `Y.Doc`, `Awareness`, or Angular primitive crosses **a driver's** seam — a rule about drivers specifically, not a blanket rule for shared modules: `relay-client` takes a `Y.Doc` precisely because it owns a connection rather than a re-evaluation rule. Client and CLI supply adapters, nothing more. Naming a driver separately from its predicate matters because the re-evaluation axis is exactly where two hand-wired copies drift.
_Avoid_: watcher, observer (Yjs owns that word), loop, poller (a driver is subscription-fed, never polls), service

**auto-reveal driver**:
The `startAutoReveal` half of the `auto-reveal` module: subscribes to projection *and* awareness changes, applies `shouldAutoReveal` to `currentRound`, and calls the adapter's `reveal()`. Session-scoped in both surfaces — a peer counts toward the unanimous denominator regardless of which screen it is on, so it checks regardless too. Holds no per-round state: the predicate's terminal guard makes a dedupe set unnecessary. Every peer runs one and any peer may write (ADR-0018 assigns no host authority).
_Avoid_: autoRevealWatcher, revealPoller, unanimityService

**autoRevealCount**:
The client-side monotonic counter `DocService` bumps when its auto-reveal driver's write actually applies. An edge signal, not a timestamp — two reveals in the same millisecond must still notify, and there is nothing to reset. The Estimating page keys its success haptic off it, which is how device feedback stays out of the doc layer.
_Avoid_: lastAutoRevealAt, autoRevealed, revealSignal

## Relay contract

**relay-client**:
The shared module that owns the entire relay contract: the three HTTP routes (`mintRoom`, `resolveRoom`, `patchRoomAccess`) and the WebSocket handshake behind `connectToRelay`. Both surfaces import it directly and neither keeps a copy — the point of naming it is that a change to how a client talks to the relay has exactly one place to land. Not a *driver*: a driver owns when a rule re-evaluates and is handed a reading of the doc, whereas `relay-client` owns a connection and is handed the `Y.Doc` itself, which is its whole job. Framework-free all the same — state leaves through callbacks, and no `ToastService`, signal, or Ink primitive crosses the seam.
_Avoid_: relay-api, sync-provider, relay service, transport (each named only half of what this owns)

**connectToRelay**:
The handshake half of `relay-client`. Takes an **http** base URL and derives the `ws://`/`wss://` form itself, so the transform exists once rather than in each surface's URL config. Returns a handle with `updateCredentials()` and `disconnect()`; everything observable — status, rejection reason, the derived reconnecting flag, the repeat-rejection throttle, the one-shot first sync — leaves through callbacks, because the client mirrors them into signals and the CLI is callback-native, and a getter would give two ways to read one state.
_Avoid_: createSyncProvider, connect, openSocket

**onSynced**:
`connectToRelay`'s one-shot callback, fired the first time the relay's Yjs snapshot has applied. The timing is the contract: a write made from here carries a Lamport clock higher than anything in the snapshot, which is what lets `rejoin` win the LWW merge (ADR-0036 §6). Never fires on a later reconnect — "first sync of this connection" is the only moment that guarantees the ordering.
_Avoid_: onConnected (a different moment), onReady, onFirstUpdate

**resolvedRelayHttpUrl**:
The client preference that folds the user's relay override together with the environment default — the URL every relay call site actually uses. Kept distinct from the raw `relayHttpUrl` override, which stays undefined when unset so the Settings field can still read as "using the default". Expressing the fold once is what stops a new relay call site from silently ignoring a self-hosted relay.
_Avoid_: relayUrl, effectiveRelayUrl, getRelayUrl
