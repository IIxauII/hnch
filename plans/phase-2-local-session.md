# Phase 2 — Local session loop (implementation plan)

Working document for the second implementation phase of hnch. Mirrors [`roadmap.md` §4](../roadmap.md#4-phase-2--local-session-loop) but expands the per-file / per-commit shape the roadmap deliberately leaves unbaked.

- **Status:** Proposed, pending execution.
- **Previous phase:** [Phase 1 — Foundation](./phase-1-foundation.md). Exit bar met; commits `e44d3d9 … 01e8173`.
- **Next phase:** [Phase 3 — Relay + multi-client sync](../roadmap.md#5-phase-3--relay--multi-client-sync).

Discard this file once Phase 2 ships and the exit bar is met; retain any decisions that turned out to be load-bearing either as ADRs (if structural) or as comments near the relevant code.

## 1. Scope recap

A single client plays a full planning-poker session — create room → lobby → round 1 (vote → reveal) → re-vote → round 2 → back to Home — entirely locally. No relay, no networking, no persistence beyond the already-wired display name.

This is the first phase that exercises [`schema.md`](../schema.md) end-to-end. Expect at least one ambiguity to surface; fix it by editing `schema.md` (plus a new ADR if the edit is shape-level per [`CLAUDE.md`](../CLAUDE.md) → "ADR requirement").

Phase 2 is about the *client-side* doc binding and UI flow. The concrete doc mutations we implement here are the exact ones Phase 3 will start syncing over the wire without further changes.

## 2. Decisions settled for this phase

### 2.1 Yjs ↔ Angular binding pattern

The roadmap's Phase 2 risk note flags this as the phase's first real design call. The choice is between:

- **(A) Plain `Y.observe` → `WritableSignal.set()`** in a central service, with components reading only `Signal<T>` views. Zero extra libraries.
- **(B) `Y.observe` → `BehaviorSubject` → `toSignal()`**. Adds an RxJS layer between the Y event and the component.
- **(C) A third-party adapter** (`y-angular`, `valtio`-style). Extra dep, unproven in this stack.

**Decision: (A).** Rationale:

- [`angular.md`](../angular.md) already elevates `signal()` / `computed()` as the default state-management primitive — so signals-first is the idiomatic Angular 20 choice.
- The service fully encapsulates Yjs; components never import `yjs`. That means the binding pattern is swappable later without touching any screen.
- No new library enters the stack, so this is *not* architectural per [`CLAUDE.md`](../CLAUDE.md) → "ADR requirement" and needs no ADR. We document the choice inline in the doc service's docstring.
- Option (B) buys nothing for our access pattern: components read, they don't compose streams; a signal + `computed()` covers everything `combineLatest` would.

Concretely: the service holds the `Y.Doc`, subscribes to `observeDeep` on each top-level container, and on every event writes a new immutable projection (plain JS object graph, via `.toJSON()`-style extraction) to a `WritableSignal`. Components bind to the signals through `computed()` selectors. See §3.2 for the shape.

### 2.2 `participantId` stub (Phase 2 only)

[ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md) says `participantId = deviceId` from the Capacitor Device plugin. That plugin lands in Phase 3. For Phase 2 we use a persistent per-install random UUID so the behavior is shape-equivalent:

- Service `ParticipantIdService` (in `core/`) reads `hnch.participantId` from Capacitor Preferences.
- If absent, generates a `crypto.randomUUID()`, writes it, returns it.
- Once Phase 3 wires the real Device-plugin ID, this service gets a single-shot migration step and the Preferences key is retired.

This keeps the abstraction boundary honest: no screen knows that the id is currently a UUID rather than a device id.

### 2.3 Single-session in-memory state

The doc service holds **zero or one** active session at a time. It exposes:

- `hasSession: Signal<boolean>` — `true` iff a `Y.Doc` is currently initialized.
- `createSession({ scale, revealMode, timerDurationMs, displayName })` — mints a `roomUuid`, seeds `meta` / `settings` / `participants` (with just you), returns.
- `endSession()` — tears down the `Y.Doc`, unsubscribes observers, nulls out the projections.

This matches the Phase 1 lack-of-persistence story: close the tab, lose the session. A local-persistence layer (Capawesome SQLite / IndexedDB per ADR-0004) is Phase 6 and does *not* land here.

### 2.4 No timer auto-reveal

Per the roadmap, the timer picker may be exposed in settings, but **voting does not auto-reveal** this phase. Reveal is host-tap only. Timer-driven reveal is Phase 4.

The UI consequence: if a session has `revealMode = 'timer'` and `timerDurationMs` set, the Estimating screen renders a countdown for visual realism, but `timerStartedAt` is **not** written by Phase 2 code — the countdown stays visually at the configured duration (or is hidden) and the host still has to tap Reveal. This keeps the schema clean and makes Phase 4's work a purely additive change.

### 2.5 Angular conventions (unchanged)

Same house rules as Phase 1 ([`angular.md`](../angular.md)): standalone, OnPush, `inject()`, signals, `input()` / `output()`, native control flow, reactive forms, `unknown` > `any`, etc.

## 3. Work breakdown

### 3.1 Dependencies

- `yjs` — the CRDT core. No `y-websocket` (that's Phase 3). Pin to the latest `^13.x`.
- No other new deps. `uuid`-style IDs come from `crypto.randomUUID()` (browser + Node 22+).

### 3.2 `DocService` — the Yjs-backed session state

`packages/client/src/app/core/doc/doc.service.ts`.

Shape:

```ts
@Injectable({ providedIn: 'root' })
export class DocService {
  readonly hasSession: Signal<boolean>
  readonly meta: Signal<Meta | null>
  readonly settings: Signal<Settings | null>
  readonly participants: Signal<readonly (Participant & { id: string })[]>
  readonly rounds: Signal<readonly Round[]>
  readonly currentRound: Signal<Round | null>   // last non-revealed, else last

  createSession(init: CreateSessionInit): void
  endSession(): void

  updateSettings(patch: Partial<Settings>): void
  upsertParticipant(p: Participant & { id: string }): void
  startRound(descriptor: Pick<Round, 'title' | 'description' | 'ticketId'> & { parentRoundId?: string }): string
  castVote(roundId: string, participantId: string, card: string): void
  clearVote(roundId: string, participantId: string): void
  revealRound(roundId: string): void
}
```

Internals:

- Private `Y.Doc`, `Y.Map` handles for `meta` / `settings` / `participants`, `Y.Array` for `rounds`.
- `observeDeep` on each, each handler rebuilds the plain-JS projection (via helper functions in the service) and calls the writable signal's `.set(...)`.
- All writes happen inside a `doc.transact(() => …)` so observers fire once per logical mutation.

### 3.3 `ParticipantIdService`

`packages/client/src/app/core/participant-id.service.ts`.

- Single async getter `getOrCreateId(): Promise<string>` backed by `hnch.participantId` in Preferences.
- Called once at app bootstrap (or lazily on first session); cached in a signal for sync reads thereafter.

### 3.4 Home → Create Room wiring

`packages/client/src/app/home/home.page.ts`.

Replace the `console.debug('create room — phase 2')` stub with:

1. Read the persisted display name.
2. `docService.createSession({ ... seeded with FIBONACCI_SCALE, revealMode 'manual', displayName, participantId })`.
3. `router.navigate(['/lobby'])`.

### 3.5 Lobby screen

`packages/client/src/app/lobby/lobby.page.ts`.

Implements ux.md §5.4 (host variant only for Phase 2 — there are no joiners without a relay):

- Large title = `meta.roomUuid.slice(0, 7)` until Phase 3 wires a relay-minted room code. Add a `// Phase 3: replace with relay-assigned room code` marker.
- Subtitle: `"Round {n} • {scaleId} • {timerLabel}"` computed from the doc projections.
- `ion-item` buttons: "Share invite" (stubbed, logs + toast "Share lands in Phase 5"), "Show QR code" (same).
- Participants section — one row (you), host-badged.
- Tapping the subtitle or the ⋯ "Session settings" opens the half-sheet (§3.6).
- Footer primary: "Start Round N" → opens Round-start modal (§3.7).
- Back-navigation returns to Home and calls `docService.endSession()`. A confirmation alert guards this per ux.md §2 ("Destructive actions").

### 3.6 Session settings half-sheet

`packages/client/src/app/session-settings/session-settings.sheet.ts` (component) + the three pickers (`scale-picker.sheet.ts`, `timer-picker.sheet.ts`, `access-picker.sheet.ts`) under the same folder.

- Modal host = `IonModal` with breakpoints `[0, 0.6, 0.95]` per ux.md §5.8.
- Scale picker: radio group over `BUILTIN_SCALES`. Selecting commits immediately via `docService.updateSettings({ defaultScale })`.
- Timer picker: `[None, 30s, 1min, 2min, 3min, 5min]`. `None` → `revealMode: 'manual'`, `timerDurationMs: undefined`. Any numeric → `revealMode: 'timer'`, `timerDurationMs: n`.
- Access picker: radio group over `['open', 'password', 'invite']`. Phase 2 **writes no doc field** (access is a relay concern per ADR-0009) — the selection is held in a local signal and the inline password input is shown per ux.md §5.8. Phase 5 wires this to the relay handshake; a TODO comment names ADR-0009 and roadmap §7.

### 3.7 Round-start modal

`packages/client/src/app/round-start/round-start.sheet.ts`.

- `IonModal` half-sheet.
- One optional descriptor input (mapped to `Round.title`).
- "Start" button always enabled (descriptor is optional per ux.md §5.8).
- On tap: `docService.startRound({ title?: string, parentRoundId?: string })` (writes a round with `createdAt`, `createdBy = myParticipantId`, empty `votes`, `scale` snapshot from settings, **no** `timerStartedAt`), dismisses, navigates to `/estimating`.

### 3.8 Estimating screen

`packages/client/src/app/estimating/estimating.page.ts`.

Implements ux.md §5.5:

- Title = `"Round {index}"` using `rounds().length` at time of render.
- Optional descriptor line from `currentRound()?.title`.
- Timer display — computed from `settings().timerDurationMs` when set; for Phase 2, purely visual (never decrements past the configured duration, since `timerStartedAt` is never written). Add a `// Phase 4: drive from timerStartedAt` marker.
- Avatar row — since there's only one participant this phase, renders as `● 1 of 1 voted` once you vote. Still a component — `AvatarVoteRow` — so Phase 3 can pass a real list.
- Card grid — 3-column `ion-card` tiles over `currentRound().scale.cards`. Selected card bound to `currentRound().votes[myId]`. Tapping a card:
  - First tap: `docService.castVote(currentRound.id, myId, card)`.
  - Tap the selected card again: `docService.clearVote(...)` (ADR-0013 allows change-until-reveal).
- Host-only footer: "Reveal Votes" → `docService.revealRound(currentRound.id)`, navigates to `/revealed`. Host-only is trivially true this phase (only you).

### 3.9 Revealed screen

`packages/client/src/app/revealed/revealed.page.ts`.

Implements ux.md §5.6:

- Title = `"Round {index} Results"`.
- Groups via a `computed()` selector: `votes` → `{ [card]: participantId[] }`, sorted by count desc, tie-break by card value asc.
- Each group rendered as `ion-item-group`: heading `"{card} ({n} vote(s))"`, then an `ion-chip` per voter.
- Non-voters aggregated under a muted **Didn't vote** group (Phase 2 only ever has this populated if you mid-round toggle your vote off, but the logic is there for Phase 4 timer-expiry joiners).
- Host-only footer with two buttons: **Re-vote** (creates a new round with `parentRoundId = currentRound.id`, inherits title/description/ticketId; navigates to `/estimating`) and **Next Round** (opens Round-start modal again).

### 3.10 Navigation polish

- Leaving Estimating or Revealed via back-nav (not via Re-vote / Next Round) pops back to Lobby. The session stays active until the user leaves Lobby.
- Leaving Lobby pops to Home and tears the session down (§3.5).

### 3.11 Tests

The `@hnch/shared` package keeps Vitest; Phase 2 adds:

- `doc.service.test.ts` using a headless `Y.Doc` — create-session roundtrip, update-settings propagates, startRound / castVote / revealRound sequence writes the expected round shape. No DOM, no Angular TestBed — just sanity-checking the service's Yjs plumbing.
- Component tests remain out of scope per [`roadmap.md` §9](../roadmap.md#9-cross-cutting-concerns) ("no Karma/Cypress in v1").

The service tests can live in `packages/client/src/app/core/doc/doc.service.test.ts` and run via the existing Angular Vitest path once we set it up, or — to avoid the Angular TestBed entirely — we extract the projection logic to a pure helper (`projectDoc(doc): DocProjection`) and test that. **Preferred:** the pure-helper split, so tests stay framework-free.

## 4. Commit plan

Small, bisectable, green at each step:

1. **`Add yjs dep and pure doc projection helper`** — install `yjs`, add `projectDoc()` and mutation helpers in a framework-free file plus Vitest coverage. No Angular wiring yet.
2. **`Wire DocService on top of the projection helper`** — the Angular service, signal-backed, calling into the pure helpers. No UI change yet.
3. **`Add ParticipantIdService + Home → Create Room`** — persistent UUID stub, Home button creates a session and pushes to `/lobby`.
4. **`Implement Lobby host view + Start Round modal`** — the pre-round screen, the round-start modal, navigation to `/estimating`.
5. **`Implement Estimating screen`** — card grid, vote cast/clear, avatar row component, host Reveal button.
6. **`Implement Revealed screen`** — grouped results, Re-vote (creates round with `parentRoundId`), Next Round.
7. **`Implement Session Settings half-sheet + pickers`** — scale / timer / access pickers. Access selection held in local state only (Phase 5 wires to relay).
8. **`Polish nav: Lobby back → Home tears down session; destructive confirm`** — the small details in §3.10.

Each commit ends with `ng build` + `ng lint` clean in client, `tsc --noEmit` + `vitest run` clean in shared.

## 5. Out of scope for Phase 2

Explicit non-goals so scope doesn't drift:

- Any network code (relay, y-websocket, WebRTC). All networking is Phase 3.
- Capacitor Device plugin / real device-derived `participantId`. Phase 3.
- Timer-driven auto-reveal. Phase 4.
- Password / invite access enforcement. Phase 5 (the *UI* ships as a local-state picker this phase; it just doesn't affect anything yet).
- Share sheet, QR display, QR scanner, universal links. Phase 5.
- Jump-back-in banner wiring. Phase 3 (needs the session cache).
- Any durable persistence of session state (Capawesome SQLite / IndexedDB). Phase 6.
- Settings screen real content (display-name editor, theme picker). Phase 6.
- Haptics on card tap. Phase 6.
- Component / UI tests. Phase 6 (and per [`roadmap.md` §9](../roadmap.md#9-cross-cutting-concerns) may stay deferred past v1).

## 6. Exit bar

From [`roadmap.md` §4](../roadmap.md#4-phase-2--local-session-loop), unmodified:

> On a single device, you can create a room, configure settings, run Round 1 (vote → reveal), re-vote, run Round 2, and leave back to Home. No network involved.

Smoke-test recipe:

1. `pnpm install && pnpm --filter @hnch/client start`.
2. Onboard (if not already). Expect Home.
3. Tap Create Room → expect Lobby with a room code shape, you as sole participant.
4. Tap ⋯ → Session settings. Change scale to T-shirt, close sheet; subtitle updates to "Round 1 • t-shirt • No timer".
5. Tap Start Round 1 → type a descriptor → Start → expect Estimating with t-shirt cards.
6. Tap `M` → card highlights, avatar row shows `● 1 of 1 voted`.
7. Tap Reveal Votes → expect Revealed, `M` group with one chip (you).
8. Tap Re-vote → expect Estimating again, descriptor carried over, no prior vote highlighted.
9. Vote `L` → Reveal → Next Round → Start → vote `S` → Reveal. Round index in title reads correctly throughout.
10. Back-nav from Revealed pops to Lobby; back-nav from Lobby pops to Home; an alert confirms before the session is discarded.

## 7. Risks

- **Projection granularity.** Rebuilding the entire projection on every Y event is fine at our scale (a handful of participants, a handful of rounds) but would not scale to 10k-round sessions. If a profile ever shows it in the hot path, the remedy is per-container fine-grained signals rather than one global projection — documented as a TODO in the service.
- **Schema ambiguity surfacing.** First real consumer of `schema.md`. If `Y.Map` vs plain-object representation differs from what a screen expects, pause, fix `schema.md`, add an ADR if shape-level, then proceed. Do not paper over in code.
- **`crypto.randomUUID()` in older browsers.** Phase 2 targets modern Chromium / WebKit (Capacitor 8 runtimes) so this is fine, but worth noting for the Phase 3 polyfill discussion when we start thinking about the PWA deployment target.

## 8. Parking lot

Ideas surfaced while planning Phase 2 that are out-of-scope but worth remembering:

- A `DocProjection` TypeScript type exported from `@hnch/shared` so both the relay (which can produce snapshots in Phase 3) and the client agree on the wire-stable JSON shape. Revisit when writing the relay snapshot endpoints in Phase 3.
- A `useDocSignal<T>(selector)` helper that wraps `computed()` with a memoized selector over the projection signal. Only worth adding if we start seeing repetition across screens.
- `Round.title` vs `Round.description` ux split — the round-start modal shows one input this phase; future richer round metadata (ticket ID, longer description) can reuse the same modal with additional optional fields.
