# Phase 4 — Timer + host election (implementation plan)

Working document for the fourth implementation phase of hnch. Mirrors [`roadmap.md` §6](../roadmap.md#6-phase-4--timer--host-election) but expands the per-package / per-commit shape the roadmap deliberately leaves unbaked.

- **Status:** Proposed, pending execution.
- **Previous phase:** [Phase 3 — Relay + multi-client sync](./phase-3-networking.md). Exit bar met; commits `e71c8c8 … ddea0d1`.
- **Next phase:** [Phase 5 — Access control + invite paths](../roadmap.md#7-phase-5--access-control--invite-paths).

Discard this file once Phase 4 ships and the exit bar is met; retain any decisions that turned out to be load-bearing either as ADRs (if structural) or as comments near the relevant code.

## 1. Scope recap

The session is already multiplayer; Phase 4 makes it *resilient*. Two coordination-flavoured behaviours land:

1. **Timer-driven reveal.** When `settings.revealMode === 'timer'`, Start Round writes `round.timerStartedAt = Date.now()`; every client derives a live `M:SS` countdown from `settings.timerDurationMs`; the host's client writes `round.revealedAt` at expiry; any client may write `revealedAt` as an idempotent fallback if the host was offline at the moment the timer ran out.
2. **Host election.** If the current `settings.hostParticipantId` vanishes from awareness, clients wait 5 s; if still absent, the lexicographically-lowest *online* participantId promotes itself by writing to `settings.hostParticipantId`. A transient "Alice is now hosting" toast confirms the change. Reconnection by the prior host does **not** reclaim the role.

Both features are implementations of accepted ADRs — [ADR-0010](../adr/0010-host-election.md), [ADR-0011](../adr/0011-timer-authority.md), [ADR-0015](../adr/0015-v1-scope-session-level-reveal-and-timer.md). No architectural decision is expected to change; any surprise that *does* surface triggers a new ADR before code lands ([`CLAUDE.md`](../CLAUDE.md) ADR requirement).

Phase 4 is **not** about access control (Phase 5), Settings/theme/haptics polish (Phase 6), or native builds (Phase 6). It is narrowly the two features above plus whatever tests, docs, and minor plumbing they demand.

## 2. Decisions settled for this phase

### 2.1 No new ADR expected

[ADR-0010](../adr/0010-host-election.md), [ADR-0011](../adr/0011-timer-authority.md), and [ADR-0015](../adr/0015-v1-scope-session-level-reveal-and-timer.md) already pin the algorithm, the authority rules, and the field locations respectively. Phase 4 is implementation, not design. Two pre-flight checks before Commit 1 lands:

- Re-read ADR-0010's 5-second debounce rationale and confirm we're still comfortable with it at Phase-4 latency. Current posture: yes.
- Re-read ADR-0011's "idempotent fallback" paragraph in the Consequences section — it is the single paragraph the implementation must match verbatim; if the semantics change during build, write a superseding ADR *before* the code that depends on the change.

If `schema.md` needs any clarification as the code goes in (e.g. a note that `timerStartedAt` is writer-agnostic once the round is live, but only the host *should* author it), treat that as a minor correction to the doc — no ADR required, per [`CLAUDE.md`](../CLAUDE.md) "Minor corrections (typos, broken links, clarifications) to an accepted ADR are fine".

### 2.2 Timer ticker is a shared interval signal

The countdown label on Estimating and the timer-expiry watcher on Revealed / DocService both need a "now" signal that advances faster than Angular's normal change-detection cadence. One shared `TimerTickService` exposes:

```ts
readonly now: Signal<number>  // wall-clock ms, ticks ~4 Hz
```

Implementation: `setInterval(() => nowSignal.set(Date.now()), 250)` with a `DestroyRef` cleanup. Rationale for 250 ms (not 16 ms / rAF):

- The user-visible resolution is seconds — sub-second drift is already acceptable per ADR-0011.
- `requestAnimationFrame` pauses in background tabs; the explicit interval still runs (throttled to 1 Hz on some browsers, but never paused), which matters for the host-writes-expiry path.
- 4 Hz is cheap; no measurable cost in hand-checks.

The service is tree-shakable — screens that never render a timer never subscribe. The background-tab caveat is noted on the service's docstring because it's the one place the "throttled tab may fire late" edge case gets designed around.

### 2.3 Host-election algorithm

A new `HostElectionService` (injected in `root`, instantiated lazily at session start, torn down on `endSession`) runs the state machine. It reads:

- `docService.settings().hostParticipantId`
- `docService.onlineParticipantIds()`
- `participantIdService.id()`

…and writes back to `settings.hostParticipantId` via `docService.updateSettings` when it decides to promote itself.

Semantics, mapping 1:1 to ADR-0010:

1. If the host is in the online set → no action.
2. If the host is *not* in the online set and no debounce timer is running → start a 5 s `setTimeout`. Cache the host ID that triggered the timer ("is-still-the-same-missing-host" guard).
3. If the host rejoins before 5 s → cancel the timer, no promotion.
4. If 5 s elapse and the cached missing-host still matches the current `hostParticipantId` and is still offline → compute the new host as `[...onlineParticipantIds].sort()[0]`; if that equals *my* participantId, write `settings.hostParticipantId = myId`. Otherwise no-op (peer with the lower ID will handle it).
5. If two clients both promote (same computed winner), Yjs merges to the same value — no duplication, no fight. If the *computed winner* disagrees across clients (e.g. awareness sets drift for a moment), both write: one wins, everyone re-reads the doc, the loser stands down. No further action needed; the doc is the tiebreaker.

**Five second constant named `HOST_ABSENCE_ELECTION_DEBOUNCE_MS` on the service file.** This is distinct from the connection chip's `DISCONNECTED_WARNING_DELAY_MS` even though the value coincidentally matches; they're semantically different timers and wiring them to the same symbol would misrepresent the dependency.

**No-reclaim on reconnect** is automatic — the algorithm reads `settings.hostParticipantId` and only ever writes it when a promotion fires. A host coming back sees their own ID is no longer in `hostParticipantId` and behaves as a normal peer.

**Toast.** On every *transition* of `settings.hostParticipantId` where the new value is a participant other than the session creator's first write, fire an Ionic toast: `"{displayName} is now hosting"`. The toast controller lives in Lobby / Estimating / Revealed (wherever the user currently is); the simplest implementation is a top-level effect on `App`'s root component that watches the signal regardless of route. A `previousHostId` scratch signal catches the transition without comparing against undefined-at-boot.

### 2.4 Timer wiring

Three pieces, each a narrow extension of existing code:

**(a) Write `timerStartedAt` at round start.** `DocService.startRound` currently only appends the round. Extend it: when `settings.revealMode === 'timer'` and `settings.timerDurationMs > 0`, also call `startRoundTimer(doc, id, now())` immediately after the append. The two writes are wrapped in a single `doc.transact()` so observers see a round that already has its `timerStartedAt` populated — no "flash of un-timed round" on the wire.

The pure helper `startRoundTimer` was shipped in Phase 2 (see `packages/shared/src/doc-projection.ts`:408 — "Not called by Phase 2 code … shipped now so Phase 4's timer-driven reveal is a pure UI wiring change"). Phase 4 is the first caller.

**(b) Live countdown on Estimating.** `estimating.page.ts` currently renders a static label from `formatCountdown(settings.timerDurationMs)` with a `// Phase 4` marker. Rewrite `timerLabel` to derive from `settings.timerDurationMs`, `currentRound().timerStartedAt`, and `timerTick.now()`:

```ts
protected readonly timerLabel = computed<string | null>(() => {
  const settings = this.docService.settings()
  if (!settings || settings.revealMode !== 'timer') return null
  const round = this.docService.currentRound()
  if (!round || round.timerStartedAt === undefined) return null
  const duration = settings.timerDurationMs
  if (duration === undefined || duration <= 0) return null
  const elapsed = this.timerTick.now() - round.timerStartedAt
  return formatCountdown(Math.max(0, duration - elapsed))
})
```

Final-30-seconds styling (muted red) per `ux.md` §5.5: derive a boolean `timerUrgent` computed from the same inputs (`remaining <= 30_000 && remaining > 0`), bind to a `[class.urgent]` on the `<p class="timer">`, add the accompanying CSS. Keep the existing `// Phase 4` comment marker but update its text to "wired" once the write and read are hooked up.

**(c) Host-driven expiry and idempotent fallback.** A `RoundTimerService` (also root-injected, lifetime tied to the active session) watches the current round and fires reveals:

- Compute `remaining = round.timerStartedAt + settings.timerDurationMs - now()`. When `remaining <= 0` and `round.revealedAt` is still unset:
  - If `isHost()` → `docService.revealRound(round.id)` immediately.
  - Else → wait `HOST_EXPIRY_FALLBACK_GRACE_MS` (recommend **2000 ms**) and re-check. If `revealedAt` is still unset, write it anyway. Grace gives the host's tick the chance to fire first; Yjs merges concurrent writes harmlessly if both happen.
- Once `revealedAt` is written, the existing Estimating→Revealed navigation logic (already wired in Phase 3) takes over. Phase 4 adds no new nav; the reveal *event* is what's new, not the reaction to it.

The service subscribes via an Angular `effect()` so it re-evaluates on every tick of `TimerTickService.now` and on every round change.

### 2.5 Crown icon in Lobby

ADR-0010 action item: surface the host with a subtle crown next to their name. Implementation:

- `lobby.page.ts`'s participant row renders a small `<ion-icon name="star-outline">` (or `crown-outline` if Ionicons has one; Phase-6 may revisit the icon) next to the display name when that participant's id equals `settings().hostParticipantId`.
- Size matches existing row metadata (≤ 1 rem), color `var(--ion-color-medium)` so it doesn't visually scream.
- VoiceOver: an `aria-label="Host"` on the icon so the attribute is announced.
- Zero behavior change beyond the glyph; the chip in the toolbar already conveys connection state.

### 2.6 Reveal button is host-gated (already is)

Phase 3's Estimating page gates `Reveal Votes` behind `isHost()`. Phase 4 does not change this — the button stays, timer reveal is additional not replacing. The only interaction worth calling out: when a new host is elected mid-round, their client's `isHost()` flips to `true` and the button appears without a reload. That's a natural consequence of the existing signals and doesn't need extra wiring.

### 2.7 Revealed page respects the new authority

The "Next Round" button on Revealed is host-gated per `ux.md` §5.7. Phase 4 inherits the signal it already uses and gets host handoff for free — no code change, but add a smoke-test step (§6) that verifies.

### 2.8 No schema changes

All fields Phase 4 touches (`timerStartedAt`, `revealedAt`, `settings.revealMode`, `settings.timerDurationMs`, `settings.hostParticipantId`) already exist and were shipped as part of Phase 1 / 2. No migration, no new writers, no change to the relay (content-blind — it neither knows nor cares which peer wrote `hostParticipantId`).

### 2.9 Angular conventions (unchanged)

Same house rules as Phases 1–3 ([`angular.md`](../angular.md)): standalone, OnPush, `inject()`, signals, `input()` / `output()`, native control flow, reactive forms, `unknown` > `any`.

## 3. Work breakdown

### 3.1 Dependencies

No new npm deps expected. Phase 4 is pure logic on top of the Phase-3 sync layer:

- `yjs` + `y-protocols/awareness` — already pinned.
- `@ionic/angular/standalone`'s `ToastController` — already used for the Phase-3 `unknown-room` toast; reused for the host-change toast.
- Vitest + `yjs` for in-process peer tests — Phase 3 already proved the pattern in `packages/relay/test/snapshot.test.ts`.

### 3.2 `TimerTickService`

New file: `packages/client/src/app/core/timer-tick.service.ts`.

- Provided in `'root'`.
- Single public signal `now: Signal<number>`.
- Boots the `setInterval` in the constructor, cleans up via `DestroyRef`.
- Unit test (Vitest on Node, if feasible without jsdom — else skip): fast-forward timers, assert the signal ticks. Low value; the wiring is trivial. Skip unless it falls out.

### 3.3 `HostElectionService`

New file: `packages/client/src/app/core/host-election.service.ts`.

- Provided in `'root'`; the service itself no-ops when no session is live (reads `docService.hasSession()` and bails early inside its effect).
- Constants: `HOST_ABSENCE_ELECTION_DEBOUNCE_MS = 5_000`.
- Single `effect(() => { ... })` that re-evaluates on every change to `onlineParticipantIds` / `hostParticipantId` / `myId`.
- Holds one `setTimeout` handle + one `missingHostId: string | null` guard for the debounce lifecycle.
- Writes via `docService.updateSettings({ hostParticipantId: winner })` when it decides to promote.
- Exposes nothing to the UI — its effects are pure doc writes. A `previousHostId` scratch signal used by the toast effect lives elsewhere (see §3.4) so this service has a single responsibility.
- Unit tests: run headless against two or three `Y.Doc`s wired to a mock `DocService`-shaped interface; assert debounce, lowest-ID winner, concurrent-promote merge, reconnect-cancels-timer, no-reclaim.

### 3.4 Toast wiring for host changes

New code path in `app.component.ts` (or a tiny dedicated `HostChangeToastService` to keep `AppComponent` thin):

- An Angular `effect()` that reads `docService.settings()?.hostParticipantId`.
- A previous-value scratch `signal<string | null>(null)`.
- On every change:
  - If `prev === null` (first render / initial host), update `prev` without showing a toast.
  - Else fire `ToastController.create({ message: '{displayName} is now hosting', duration: 2500 })`.
  - Update `prev`.

Suppress the toast when the transition is the local client promoting itself? No — you still want the confirmation. But the copy should match: "You are now hosting" when `newHost === myId`; "{displayName} is now hosting" otherwise. Small conditional in the message formatter.

Display name lookup goes through `docService.participants().find(p => p.id === id)?.displayName ?? id` so a just-joined participant with an unresolved display name falls back to the ID — no crash, just a slightly awkward toast once in a blue moon.

### 3.5 `RoundTimerService`

New file: `packages/client/src/app/core/round-timer.service.ts`.

- Provided in `'root'`.
- Constants: `HOST_EXPIRY_FALLBACK_GRACE_MS = 2_000`.
- Subscribes to `docService.currentRound()`, `docService.settings()`, `participantIdService.id()`, and `timerTick.now()`.
- When a reveal is warranted, writes via `docService.revealRound(round.id)`. The pure helper is already idempotent and Yjs merges concurrent writes to the same logical event.
- Guards against re-firing: once a reveal has been requested for a given `round.id`, a scratch `Set<string>` swallows further attempts until the round changes. This keeps the effect cheap.
- Integration test: two in-process Yjs peers, one acts as host; host writes `timerStartedAt`, both tick, assert the host writes `revealedAt` before the non-host's grace expires. Second test: host disconnects before expiry, assert the non-host writes `revealedAt` after the grace window.

### 3.6 `DocService.startRound` — conditional `timerStartedAt`

One edit in `packages/client/src/app/core/doc/doc.service.ts`:

```ts
startRound(descriptor: StartRoundInit, opts: { now?: () => number } = {}): string {
  const doc = this.requireDoc('startRound')
  const settings = this.settings()
  const createdBy = settings?.hostParticipantId
  if (!createdBy) throw new Error('…')
  const id = crypto.randomUUID()
  const now = opts.now ?? (() => Date.now())
  const timestamp = now()
  doc.transact(() => {
    appendRoundY(doc, { id, createdAt: timestamp, createdBy, /* …descriptor spreads… */ })
    if (settings?.revealMode === 'timer' && (settings.timerDurationMs ?? 0) > 0) {
      startRoundTimerY(doc, id, timestamp)
    }
  })
  return id
}
```

One transaction → one observer notification → projection rebuilds once with both fields set.

Existing Phase-2 `DocService.test.ts` (if any) extends to cover the conditional write. If the client doesn't currently have unit tests for `DocService`, the pure helper test in `@hnch/shared` (already covers `startRoundTimer` in isolation) is enough; add a small integration test inside the `RoundTimerService` test file that exercises the whole path.

### 3.7 Estimating page — live countdown + urgent styling

`packages/client/src/app/estimating/estimating.page.ts`:

- Inject `TimerTickService`.
- Rewrite `timerLabel` per §2.4(b).
- Add `timerUrgent` computed boolean.
- Template: bind `[class.urgent]` to the `<p class="timer">`.
- Styles: add `.timer.urgent { color: var(--ion-color-danger); }` — `color-danger`'s default tint is a muted red matching `ux.md` §5.5.
- Update the existing `// Phase 4` comment to describe the wiring now that it's live.

### 3.8 Revealed page — no change

No code change expected. Phase-4 smoke test (§6) verifies that a timer reveal lands everyone on Revealed correctly; the Revealed page is unchanged from Phase 3. If something surfaces, a narrow fix belongs here, but no work is scoped in advance.

### 3.9 Lobby page — crown icon

`packages/client/src/app/lobby/lobby.page.ts`:

- Import `star` or `crown-outline` ionicon (check what ships with `ionicons@8`; fall back to `star-outline` if the crown isn't available — visual polish, not correctness, so the fallback is fine).
- In the participant row template, conditionally render an `<ion-icon>` next to the display name when `participant.id === hostId()`.
- Thin computed signal `hostId = computed(() => this.docService.settings()?.hostParticipantId ?? null)`.
- VoiceOver label: `aria-label="Host"`.

### 3.10 Tests

- `@hnch/shared` — no changes. Already covers `startRoundTimer` and `revealRound` in isolation.
- `packages/client` — three new narrow test files (Vitest-on-Node, no Angular TestBed; drive the services against a mock `DocService` shape):
  - `host-election.service.spec.ts` — the five ADR-0010 cases (online, offline+debounced, online-before-5s, 5s-winner-me, 5s-winner-other).
  - `round-timer.service.spec.ts` — host writes reveal at expiry; host absent → fallback writes after grace; concurrent writes merge.
  - `timer-tick.service.spec.ts` — optional, only if the `setInterval` logic grows anything worth testing.
- `packages/relay` — no changes. The relay already forwards bytes; the only way Phase 4 touches it is through more doc updates per session, which load-wise is negligible.

### 3.11 Exit-bar verification

Before declaring Phase 4 done, run through the smoke-test recipe in §6 on two browsers. Fix anything that's visible. The recipe is the exit bar; the commit plan is the *path* to the exit bar.

## 4. Commit plan

Small, bisectable, green at each step. Every commit ends with `ng build` + `ng lint` clean in client, `tsc --noEmit` clean in all three packages, and `vitest run` green in shared + relay + client.

1. **`Add TimerTickService`** — the 250 ms interval signal, `DestroyRef` cleanup. No consumers yet.
2. **`Write timerStartedAt at round start when revealMode is timer`** — the `DocService.startRound` edit from §3.6. Test via the existing `@hnch/shared` fixtures if they cover it, else a narrow unit test here.
3. **`Live countdown on Estimating`** — Estimating `timerLabel` wired to `TimerTickService.now()` + `round.timerStartedAt`, plus the urgent-styling tweak. Manually confirm the label ticks in dev.
4. **`Add RoundTimerService host-driven reveal`** — the service + its effect. Host writes `revealedAt` at expiry. No fallback yet.
5. **`Add idempotent reveal fallback for non-host clients`** — the `HOST_EXPIRY_FALLBACK_GRACE_MS` path; test two peers where the host "disconnects" before expiry.
6. **`Add HostElectionService with 5s debounce + lowest-peer-ID election`** — service + unit tests for the ADR-0010 state machine.
7. **`Add host-change toast`** — the effect on `settings.hostParticipantId` transitions plus display-name lookup. Includes the "You are now hosting" self-case.
8. **`Crown icon on Lobby host`** — the participant-row tweak, icon import, a11y label.
9. **`Integration test: host drops at timer expiry`** — the ADR-0010 + ADR-0011 interaction test explicitly called out in ADR-0010's action items. Drives two in-process peers; assert exactly one `revealedAt` write and the new host is the surviving peer.
10. **`Exit-bar verification + docs tidy`** — walk through §6's smoke test end-to-end, update any stale `// Phase 4` comment markers, bump anything in `CLAUDE.md`'s "Current decisions at a glance" that needs to reflect what actually shipped.

Commits 4 and 5 could be one; keeping them split makes the fallback path easy to isolate if the test in commit 5 proves fiddly.

## 5. Out of scope for Phase 4

Explicit non-goals so scope doesn't drift:

- Password / invite enforcement. Phase 5.
- Share sheet, QR display, QR scanner, universal / deep links. Phase 5.
- Haptics on round start / timer warning / reveal. Phase 6 (deliberately, per `ux.md` §6 note already in Phase-3 code).
- Settings screen — display-name editor, theme picker, licenses, privacy. Phase 6.
- Reveal animation polish (staggered 80 ms fade-in-up). Phase 6.
- Native iOS build / Capawesome SQLite. Phase 6.
- Explicit host handoff UI (ADR-0010 Option C). Post-v1; would need a new ADR.
- Signed host claims / vote signing. Post-v1; would need a new ADR.
- Relay structured logging / rate limiting / metrics. Deferred until operational need.
- Component-level UI tests (Karma/Cypress). Per [`roadmap.md` §9](../roadmap.md#9-cross-cutting-concerns), may stay deferred past v1.

## 6. Exit bar

From [`roadmap.md` §6](../roadmap.md#6-phase-4--timer--host-election), unmodified:

> Kill the host client mid-round; within ~5 seconds, one of the other clients becomes host and the round continues. Run a timer-based round end-to-end; reveal fires reliably even if the host has been backgrounded.

Smoke-test recipe:

1. `pnpm install && pnpm dev`. Client on :4200, relay on :1234.
2. Browser A (Alice) onboards → Home → Create Room → Session Settings sheet → set **Timer** to 60s. Lobby shows Alice with the crown icon.
3. Browser B (Bob) joins by code. Alice's Lobby un-dims Bob; Bob has no crown.
4. Alice taps **Start Round 1** with descriptor "payment refactor". Both clients transition to Estimating; the timer label reads `1:00` and ticks down in lockstep within ~1 s. Bob's client has no Reveal button.
5. Both vote. Wait for the timer to run out (no one taps Reveal). Expected: both screens transition to Revealed automatically when the countdown reaches `0:00`. Confirm via the relay that only *one* `revealedAt` value is written (check the projection).
6. Host-drop happy path: back on Alice's Estimating (after `Re-vote`), a fresh 60s timer starts. **Close Alice's browser tab entirely** before voting. Bob's connection chip may flicker; within ~5 s, a toast reads "Bob is now hosting" on Bob's screen; Bob's Lobby shows the crown next to his own name.
7. Timer-fallback path: start another round. Alice backgrounds her tab so her interval is throttled. Let the 60s expire. Expected: the round auto-reveals (either Alice's throttled tick catches up and writes first, or Bob's fallback after the 2s grace writes). Exactly one `revealedAt`; both screens flip to Revealed.
8. Host-reconnect: have Alice's old tab return (reopen Home, tap Jump-back-in). She lands back in the session as a *non-host* participant. The crown remains on Bob.
9. Host-next-round: Bob taps **Next Round** on Revealed. A fresh round starts; Alice sees it. Her Reveal button is still hidden; Bob's is visible.
10. Reveal-mode manual regression: in a fresh Lobby, flip Timer → Manual. Start a round. No timer label on Estimating. Manual Reveal still works exactly as it did in Phase 3.

All ten steps passing → Phase 4 meets the exit bar. File a parking-lot note for any papercuts that surfaced but don't block shipping (see §8).

## 7. Risks

- **Background-tab throttling.** Chrome throttles backgrounded `setInterval` callbacks to ~1 Hz; Safari is more aggressive. The fallback reveal path is the designed mitigation (any online client can write `revealedAt`), but the smoke test in §6 step 7 is where we actually verify this. If a host backgrounded for ≥ the whole timer duration causes visible flakiness (e.g. the "M:SS" label freezes instead of ticking), the fix is UX-only — the reveal event itself is still authoritative via the fallback.
- **Awareness flicker re-triggering election.** If `y-websocket`'s awareness drops a peer for a sub-second blip, the host might appear to go offline and come back inside the 5 s window. The debounce is designed for exactly this — *but* the `missingHostId` guard must not reset on the return, or we'd reset the timer cleanly only to miss the actual drop if it recurs. Documented as a test case (§3.3).
- **Two clients compute different winners.** If clients' awareness sets differ for a moment (one has stale `added` / `removed` events), they might nominate different winners. Yjs merges concurrent writes deterministically (last-write-wins at the field level, ordered by Lamport timestamp), so one value sticks and the other loses. The loser re-reads the doc, sees the winner, and stands down. Already ADR-0010-blessed; the risk is just that we implement the "stand down" correctly (which mostly means *don't* assume our most recent write won — read the doc to confirm).
- **Fallback reveal fires before the host's write.** The `HOST_EXPIRY_FALLBACK_GRACE_MS = 2000` is a guess; under lossy networks the host's write could be in flight when we fall back. Idempotency makes this harmless (both writes produce the same `revealedAt` logically; Yjs merges to one), but if the grace turns out too aggressive, lengthen it. 2 s is more than enough headroom at LAN / good-Wi-Fi latencies.
- **Timer drift vs. wall-clock drift.** If two peers' clocks are skewed by several seconds, their countdowns will differ visibly. ADR-0011 accepts sub-second drift; multi-second drift indicates a clock-skew bug on the device, not a Phase-4 problem. Flag as a watch-for, not a design issue.
- **Implicit reveal-on-expiry conflicts with Re-vote.** Per ADR-0013, Re-vote creates a *new* round with `parentRoundId` pointing at the revealed one. Make sure the `RoundTimerService` subscribes to `currentRound()` — the fresh round — and doesn't double-fire on the just-revealed parent. A `Set<string>` of already-processed round ids in the service handles this cleanly (§3.5).

## 8. Parking lot

Ideas surfaced while planning Phase 4 that are out-of-scope but worth remembering:

- **Explicit host-handoff action sheet entry.** Right now the only way to change host is "the current host leaves." ADR-0010 Option C — letting the host explicitly hand off — is a cheap add once we have a Settings-sheet-like venue for it. Defer unless real sessions ask for it.
- **`round.timerStartedAt` repair path.** If a host drops *before* writing `timerStartedAt` (the whole round, no field, ever), no one will ever compute expiry. ADR-0011's authority rules implicitly assume the write lands; if we ever see "ghost rounds" in the field, adding a "any host may backfill `timerStartedAt` if it's missing and the round is > N seconds old" rule would cover it. Not a designed case yet because it has never been observed.
- **Cross-client diagnostic UI.** A small debug-only "doc state" pane showing `hostParticipantId`, `currentRound.timerStartedAt`, each peer's awareness — would cut smoke-testing time in half. Ship-behind-a-flag in Phase 6's Settings screen if we keep hitting host-election papercuts.
- **Unifying `TimerTickService` with any other polling the app might adopt.** Currently nothing else polls. If Phase 5's invite-token expiry gets a visual "expires in 5:32" countdown, the same ticker serves both. No refactor pressure now.
- **Toast queuing.** If two transitions happen in quick succession (host A → B → C in under 2.5 s) the toasts stack. Ionic's `ToastController` doesn't queue by default; acceptable in practice because host flaps shouldn't burst. Revisit if observed.
