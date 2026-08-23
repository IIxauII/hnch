# Host election — absorb the driver into `@hnch/shared`

Source: architecture review (candidate 01, "Absorb the host-election driver").
Scope: `packages/shared`, `packages/cli`, `packages/client`.
Delivery: single PR, atomic commits.

## Context (verified)

- Election *rule* is already single-sourced: `packages/shared/src/election.ts` — `evaluateElection` / `resolvePromotion` (pure, ADR-0048).
- The *driver* is transcribed twice: `packages/cli/src/host-election.ts:32-95` and `packages/client/src/app/core/host-election.service.ts:38-109`. Same `missingHostId` field, same 5s debounce, same switch.
- **The copies are not equivalent.** CLI subscribes to `awareness.on('change')` + the `settings` map only (`host-election.ts:82-83`). Client re-evaluates on *any* projection change (`host-election.service.ts:47-56`, effect over `projectionSnapshot`). A host that is kicked/leaves (`leftAt` set, awareness entry lingering per ADR-0036) makes the client start an election while the CLI does not — until an unrelated awareness/settings event fires. Live parity defect; ADR-0048's own Context cites this exact drift class.
- Write sinks are *not* divergent: `DocService.updateSettings` (`doc.service.ts:548-550`) is a passthrough to shared `patchSettings` (`doc-projection.ts:382`).
- Awareness → participantId-set extraction exists three times: `cli/session.ts:241`, `cli/host-election.ts:36`, `client/doc.service.ts:819`.
- CLI `session.ts:236-239` already deep-observes all four containers and fans out via `changeCallbacks`; it also polls `projectDoc` every 250ms for auto-reveal (`:255-264`). Broad-trigger cost on the CLI side is ~zero.
- Client `attach(doc)` (`doc.service.ts:765`) / `detach()` (`:790`) is the single session start/teardown choke point.
- `ParticipantIdService` injects nothing and touches Capacitor only inside `ensureLoaded` — safe as a new `DocService` dep, no DI cycle.
- `HOST_ABSENCE_ELECTION_DEBOUNCE_MS` is re-exported by both drivers; no code imports either re-export (`connection-chip.component.ts:66` mentions it in a comment only).
- E2E net exists: `packages/e2e/tests/host-election.spec.ts` covers the full 5s-debounce promotion.

## Decisions

**Port shape** — framework-free; no `Y.Doc` / `Awareness` crosses this seam:

```ts
export function startElection(deps: {
  projection(): DocProjection | null;
  onlineIds(): ReadonlySet<string>;
  myId(): string | null;
  subscribe(cb: () => void): () => void;
  promote(winnerId: string): void;
}): { stop(): void }
```

- Shared owns `missingHostId`, the debounce timer, the switch, and calls `promote`.
- Timers: plain globals, no injection port. Shared tests drive them with `vi.useFakeTimers()`.
- `projection() === null || myId() === null` → **cancel** (clear armed timer, reset `missingHostId`). Behaviour change: today the client early-returns and leaves a pending debounce armed across session end.
- Initial `evaluate()` runs synchronously on construction (matches CLI today).

**Trigger contract** — any projection change + awareness change, both adapters. "When to re-evaluate" is part of the rule, not adapter business.

**Awareness helper** — `onlineIdsFrom(states: Map<number, unknown>): Set<string>` in shared; all three copies routed through it.

**CLI** — `packages/cli/src/host-election.ts` deleted. Wired at `session.ts:230` from the existing `changeCallbacks` fan-out + `awareness.on('change')`. No new observers.

**Client** — `host-election.service.ts` deleted; `AppComponent:42` inject line and the `app.component.test.ts:115` stub removed. `DocService` owns a **session-scoped** handle: started in `attach()` immediately after `rebuildProjection()`, stopped in `detach()`. `subscribe` registers a notify called from `rebuildProjection()` and the awareness handler — synchronous, no `effect()`, nothing to flush in tests. `DocService` gains `inject(ParticipantIdService)`.

**Re-exports** — both `HOST_ABSENCE_ELECTION_DEBOUNCE_MS` re-exports dropped; consumers import from `@hnch/shared`.

**No ADR.** Owner's explicit call. Recorded cost: `adr/0048` Decision bullet 3 ("Debounce timer, `missingHostId` state, and the doc write stay in each consumer's driver") describes code that will no longer exist, and `adr/README.md`'s conflict rule points a future reader at conforming code back to the ADR. This plan is the durable record instead.

## Worktree

```
git fetch origin
pnpm worktree:add host-election-driver main --plan host-election-driver
cd ../hnch-host-election-driver
```

## Commits (atomic)

### C1 — `test(cli): cover kicked-host election trigger gap`

- Add a failing case to `packages/cli/src/host-election.test.ts`: host present in awareness, `leftAt` set on the host participant, no settings/awareness event afterwards → assert an election is armed and fires. Fails today (participants map is unobserved).

### C2 — `fix(cli): re-evaluate election on participant changes`

- Add `doc.getMap(DOC_PARTICIPANTS_KEY).observeDeep(evaluate)` + matching unobserve in `stop()`. C1 goes green. Minimal, bisectable, independent of the refactor.

### C3 — `refactor(shared,cli,client): single-source awareness→ids extraction`

- Add `onlineIdsFrom(states)` to shared (exported from the barrel).
- `cli/session.ts:241` and `client/doc.service.ts:819` call it; `cli/host-election.ts:36` local copy routed through it (dies in C4).
- Unit-cover `onlineIdsFrom`: non-string/missing `participantId` entries skipped.

### C4 — `refactor(shared,cli,client): absorb host-election driver into shared`

- `shared/election.ts`: add `startElection(deps)` per the port above; update the module docblock (it currently asserts the timer/state/write live in each driver).
- `cli`: delete `host-election.ts`; construct the handle in `session.ts` with `subscribe` = register into `changeCallbacks` + `awareness.on('change')`, `promote` = `patchSettings(doc, { hostParticipantId })`. `election.stop()` stays on the existing disconnect path.
- `client`: delete `host-election.service.ts`; `DocService` starts the handle in `attach()` after `rebuildProjection()` and stops it in `detach()`; notify fired from `rebuildProjection()` and the awareness handler; `promote` = `this.updateSettings({ hostParticipantId })`. Remove `AppComponent:42` and the `app.component.test.ts:115` stub.
- Drop both `HOST_ABSENCE_ELECTION_DEBOUNCE_MS` re-exports.

### C5 — `test(shared,cli,client): move election driver behaviour to shared`

- `shared/election.test.ts` (~350 lines): debounce arm/cancel/re-arm on host change, promotion only by lex-lowest eligible, stand-down when host returns, kicked-lingering host, `null` projection / `null` myId cancels an armed timer, `stop()` clears. Fake deps + `vi.useFakeTimers()`.
- `cli/host-election.test.ts` → ~40 lines of wiring: subscribe fires on awareness change and on doc change; `promote` writes `settings.hostParticipantId`.
- `client/host-election.service.test.ts` deleted; ~40 lines of wiring folded into `doc.service.test.ts`: `rebuildProjection` and the awareness handler notify the driver; promote reaches `updateSettings`; handle stops on `detach`.

## Verify (pre-push)

```
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

`packages/e2e/tests/host-election.spec.ts` is the acceptance gate — it exercises the real 5s debounce and the host-change toast on the client adapter.

## Screenshot tags

`@host`

Rationale: change is behavioural, not visual. The only surfaces that can regress are host-conditional lobby chrome (host star, host-only action buttons) after a promotion — covered by `@host`-tagged scenes. No layout, theming, or reveal surface is touched.

## Key files reference

| File | Role after C4 |
|---|---|
| `packages/shared/src/election.ts` | rule + driver + `onlineIdsFrom` |
| `packages/cli/src/session.ts:230` | CLI adapter (subscribe/promote wiring) |
| `packages/cli/src/host-election.ts` | deleted |
| `packages/client/src/app/core/doc/doc.service.ts` | client adapter, session-scoped handle in `attach`/`detach` |
| `packages/client/src/app/core/host-election.service.ts` | deleted |
| `packages/client/src/app/app.component.ts:42` | inject line removed |

## As landed (deviations from the plan above)

Recorded here because this document — not an ADR — is the durable record for
this change (see the No-ADR decision above).

1. **Presence key exported, not just the extraction.** The plan single-sourced
   the awareness→ids *read*. The field name itself was still re-declared at
   five write sites, so a rename would have half-landed anyway — the exact
   failure the change set out to prevent. `AWARENESS_PARTICIPANT_ID_FIELD` is
   now exported from `shared/election.ts` and imported at every read and write
   site (`cli/session.ts` ×2, `cli/index.ts`, `cli/commands/agenda.ts`,
   `client/doc.service.ts`).

2. **Client wiring tests live in their own file.** C5 said to fold them into
   `doc.service.test.ts`. That suite is a hand-rolled harness that *replicates*
   `DocService`'s wiring rather than instantiating it, so assertions there would
   have proved nothing about the adapter. The wiring suite is
   `doc.service.election.test.ts` instead — real service via `TestBed`, prior
   art `doc.service.terminal.test.ts`. `doc.service.test.ts`'s header points at
   it.

3. **CLI wiring suite renamed.** `host-election.test.ts` →
   `session.election.test.ts`, after the module it actually covers now that
   `host-election.ts` is gone. `docs/cli.md` and the two CLI agent tree maps
   were updated for the deleted file.

4. **Awareness is seeded before `attach()`.** The plan put the driver in
   `attach()`, which both session entry points called *before*
   `initAwareness()`. The driver's synchronous initial evaluation therefore read
   an empty online set and armed a debounce against a present host — self-
   cancelling, but only by ordering luck. `initAwareness()` now runs first in
   `createSession` / `joinSession`.
