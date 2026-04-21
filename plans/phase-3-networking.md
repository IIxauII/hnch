# Phase 3 — Relay + multi-client sync (implementation plan)

Working document for the third implementation phase of hnch. Mirrors [`roadmap.md` §5](../roadmap.md#5-phase-3--relay--multi-client-sync) but expands the per-package / per-commit shape the roadmap deliberately leaves unbaked.

- **Status:** Proposed, pending execution.
- **Previous phase:** [Phase 2 — Local session loop](./phase-2-local-session.md). Exit bar met; commits `d28b211 … 5109269`.
- **Next phase:** [Phase 4 — Timer + host election](../roadmap.md#6-phase-4--timer--host-election).

Discard this file once Phase 3 ships and the exit bar is met; retain any decisions that turned out to be load-bearing either as ADRs (if structural) or as comments near the relevant code.

## 1. Scope recap

Two or more clients — on different devices / browsers / tabs — sync a live session through a real relay. Create a room on device A, type the code on device B, and both see the same lobby; start a round and vote on both; tap Reveal on one and the other flips to the results screen.

Phase 3 is the first phase that touches a server. `packages/relay` stops being an empty placeholder and becomes a content-blind y-websocket process per [ADR-0001](../adr/0001-networking-crdt-over-relay.md). The doc mutations already wired in Phase 2 now propagate through the wire without any change to the `DocService` API — that was the whole point of framing the client against a pure projection.

Phase 3 is **not** about access control or about perceived robustness. Password / invite paths are Phase 5; timer-driven reveal and host election are Phase 4. The relay ships in *permissive* mode — every join is accepted as long as the handshake *shape* is well-formed — so that the wire-protocol work is covered here and Phase 5 only adds the enforcement layer.

## 2. Decisions settled for this phase

### 2.1 Pre-phase gate — ADR-0016 (client ↔ relay connection handshake)

[Roadmap §5](../roadmap.md#5-phase-3--relay--multi-client-sync) flags this as a hard pre-phase gate and [ADR-0009](../adr/0009-access-control-relay-tokens.md)'s open action item ("design the invite-flow protocol") is the same knot. Before a single line of relay code is written, we land **ADR-0016: Client ↔ relay connection handshake**, answering:

- How does the client resolve a room code to the relay's internal room UUID? (HTTP `GET /rooms/:code` vs. "connect to `/ws/:code` and let the relay map") — recommend HTTP resolve so rejection UX is cheap.
- What is the wire shape of `JoinCredentials` at socket-connect time — URL query params on the WS upgrade, or a first JSON frame after upgrade? — recommend query params so `y-websocket`'s default client pathway is untouched.
- What is the shape of `JoinResponse` rejections — close with a numeric WS code plus a JSON payload (`{ reason }`) on the close-event reason string — so the existing `JoinRejectionReason` union from `@hnch/shared`'s `auth.ts` round-trips faithfully.
- Where does the snapshot (ADR-0012) land in the handshake? Answer: nowhere special — y-websocket's sync-step-1/step-2 dance will rehydrate from the relay's in-memory `Y.Doc` by the same protocol used for live updates.

The ADR is ~1 page, one commit, and lands before any relay code. Its *decision* section pins the wire format so both client and relay code can reference it by name. Specific hashing choices and invite URL formats stay deferred to Phase 5 (tracked as open action items on the ADR, not blockers for Phase 3).

### 2.2 Real `participantId` — Capacitor Device plugin + migration from the UUID stub

Phase 2 used `crypto.randomUUID()` persisted via `@capacitor/preferences` (see Phase 2 §2.2). [ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md) calls for `Device.getId()`. Phase 3 swaps the implementation:

- `ParticipantIdService.getOrCreateId()` now calls `Device.getId()` via `@capacitor/device`. On web that still returns a generated UUID stored in the plugin's backing storage; on iOS/Android it returns the platform-native identifier.
- Migration is a single-shot read: if the Preferences key `hnch.participantId` holds a value, keep using it and drop the new Device ID on the floor. Rationale: Phase 2 has **no durable sessions** (§3.3 of the Phase 2 plan) so the migration's only effect is keeping a user's display-name binding stable. Once the legacy key is drained (bumping some eventual `schemaVersion` later), we can retire the compatibility read.
- The service's public signal API doesn't change. Screens that read `participantId.id()` continue to work.

### 2.3 Jump-back-in banner storage

The Home screen gains a "Jump back in" banner when the device has recently been in a session. Stored via Preferences under `hnch.lastSession`:

```ts
interface LastSessionCache {
  readonly roomCode: string       // normalized, no dash
  readonly roomUuid: string       // for direct resolve on tap
  readonly lastScreen: 'lobby' | 'estimating' | 'revealed'
  readonly lastSeenAt: number     // epoch ms
}
```

Cleared when:
- the user taps Leave from Lobby (Phase 2 §3.10; the destructive confirm already lives there),
- or the relay reports `unknown-room` on rejoin (ADR-0012's 24-hour TTL lapsed and the room is gone),
- or `lastSeenAt` is more than 24 hours old (match the snapshot TTL; pre-filters the obvious misses without a round-trip).

The cache is *aspirational* — nothing on the device guarantees the session still exists on the relay. Tapping the banner attempts a rejoin; on `unknown-room` we toast per [`ux.md` §4.6](../ux.md) and return to Home.

### 2.4 Permissive access control

Per roadmap §5: the relay validates the *handshake shape* and accepts every well-formed join regardless of what's in `passwordHash` / `inviteToken`. This keeps the wire-protocol work in Phase 3 and defers enforcement to Phase 5, which will add:

- Registering a password hash at room-create time.
- Single-use invite token minting + redemption.
- `JoinRejectionReason` responses for `wrong-password` / `invalid-invite` / etc.

Phase 3's only valid rejection reason is `unknown-room`. The relay still writes the `JoinCredentials.passwordHash` field into the in-memory room record (as an opaque string, if present) so that Phase 5's enforcement hook can land without a wire-protocol revision.

### 2.5 Awareness is authoritative for "online"

Every screen that shows participant presence (Lobby participant list, Estimating avatar row, Revealed voter chips) derives *online* from the **awareness set**, not from the `participants` Y.Map (schema.md → "Awareness"). Concretely:

- `DocService` exposes a new `onlineParticipantIds: Signal<ReadonlySet<string>>` derived from the `y-websocket` provider's `awareness.getStates()`.
- Participants in the doc but not in awareness are rendered dimmed (ghost). This is the exact wiring Phase 4's host election will observe.
- Phase 3 publishes only `{ participantId }` in the awareness entry. Future typing indicators etc. join the same map; the doc stays unbloated.

The doc's `participants` map remains the authoritative identity store (display names, onboarding). Awareness is presence *only*.

### 2.6 Dev loop

Root `pnpm dev` script runs client and relay together via a concurrency wrapper (e.g. `concurrently "pnpm --filter @hnch/client start" "pnpm --filter @hnch/relay start"`). Both processes hot-reload independently. No global deploy URLs yet; the client reads the relay URL from an env-driven constant (`RELAY_URL`, default `ws://localhost:1234`).

### 2.7 Angular conventions (unchanged)

Same house rules as Phase 1/2 ([`angular.md`](../angular.md)): standalone, OnPush, `inject()`, signals, `input()` / `output()`, native control flow, reactive forms, `unknown` > `any`.

## 3. Work breakdown

### 3.1 Dependencies

Client (`packages/client`):
- `y-websocket` — the provider. Pin to the version compatible with the `yjs ^13.x` already installed in Phase 2.
- `@capacitor/device` — real `participantId`.

Relay (`packages/relay`):
- `ws` — the WebSocket server.
- `y-websocket` — the `setupWSConnection` helper (or its current named export). Content-blind forwarding is what this package is for.
- `yjs` — for the snapshot path: the relay holds a `Y.Doc` per active room so sync-step-1/2 rehydration works.
- `@hnch/shared` — type import only (`JoinCredentials`, `JoinResponse`, `JoinRejectionReason`, the room-code generator / validator).

No other new deps. The relay has no database, no auth stack, no job queue.

### 3.2 `packages/relay` scaffolding

`packages/relay/src/index.ts` — the entrypoint. Starts an HTTP server, hands upgrade events to the WS handler.

`packages/relay/src/room-store.ts` — the in-memory data model:

```ts
interface RoomRecord {
  readonly uuid: string
  readonly code: string
  // Permissive Phase 3; Phase 5 reads these:
  readonly passwordHash?: string
  readonly invitesOutstanding: Set<string>
  // The relay's canonical copy of the doc, used for snapshot + rehydration.
  readonly doc: Y.Doc
  // Refcount of connected sockets; when zero, start the snapshot TTL.
  connections: number
  lastEmptyAt?: number
}
```

All state is in RAM per [ADR-0012](../adr/0012-snapshot-policy.md). Two indexes: `byUuid: Map<string, RoomRecord>` and `byCode: Map<string, string>` (code → uuid).

`packages/relay/src/code-pool.ts` — generates codes via the already-extant `@hnch/shared/room-code` helper, retries on collision with the active+retired sets per ADR-0008.

`packages/relay/src/snapshot.ts` — the 24-hour TTL sweeper. Runs on a setInterval (cheap; no finer scheduling needed). On snapshot expiry: remove the `RoomRecord`, remove both index entries, retire the code for reuse.

`packages/relay/src/server.ts` — the HTTP + WS wiring. Routes:

- `GET /health` — `200 {"status":"ok"}`.
- `POST /rooms` — mints a room: body `{ code? }` optional (ADR-0008 says server generates). Response `{ uuid, code }`.
- `GET /rooms/:code` — resolves a code to a uuid, or `404` with `{ reason: 'unknown-room' }`.
- `WS /ws/:uuid` — the y-websocket socket, with query-string credentials per ADR-0016. On accept, hand the socket to `y-websocket/bin/utils`'s setup helper, bound to this room's `Y.Doc`.

### 3.3 Client: sync provider abstraction

`packages/client/src/app/core/doc/sync-provider.ts` — the thin wrapper around `y-websocket/WebsocketProvider`. Two shapes:

- **Host/create path:** client mints a `crypto.randomUUID()` for the new `Y.Doc`, `POST /rooms` to the relay to register, then `WebsocketProvider(relayUrl + '/ws/' + uuid, ...)`. The relay initializes its `RoomRecord.doc` from the first sync step.
- **Join path:** client does `GET /rooms/:code`. On `404` → toast + stay on Join screen. On `200` → `WebsocketProvider(relayUrl + '/ws/' + uuid, ...)` with `JoinCredentials` packed into the URL query per ADR-0016.

The provider forwards awareness and document updates. `DocService` gains an opaque `provider: SyncProvider | null` handle and subscribes to its `status` event for UI-level connection states (connected / connecting / disconnected).

### 3.4 Client: Create Room uses relay-minted code

`home.page.ts#onCreateRoom` gains one extra step: after `docService.createSession({...})` mints the `Y.Doc`, the sync provider's bootstrap path `POST`s to the relay, stores the returned `{ uuid, code }` into `meta.roomUuid` / `meta.roomCode`, and *then* navigates to Lobby. Phase 2's fallback of "use `roomUuid.slice(0,7)` as the pseudo-code" is deleted; the `Phase 3: replace with relay-assigned room code` marker in Lobby gets a corresponding cleanup.

If the `POST /rooms` call fails (relay down), the Create Room flow surfaces an error toast and leaves the user on Home; the stub UUID is not written.

### 3.5 Client: Join Room screen

`packages/client/src/app/join/join.page.ts`.

- Numeric keyboard for the 6-character entry (Ionic `ion-input` with `inputmode="text"` and auto-uppercasing via a reactive form transform), mirrors ux.md §5.3.
- "Join" button `disabled` until the code normalizes to 6 valid characters (reuse `@hnch/shared`'s `validateRoomCode`).
- Tapping Join: resolves via `GET /rooms/:code`, connects the sync provider, navigates to Lobby on success.
- On rejection: toast with the `JoinRejectionReason` mapped to user-visible copy. Phase 3 only produces `unknown-room` in practice; other reasons surface as generic fallback copy until Phase 5.
- Password / invite fields are **not** rendered yet (Phase 5 scope).

### 3.6 Client: Capacitor Device integration

`core/participant-id.service.ts` — swap `crypto.randomUUID()` for `Device.getId()`. Preserve the migration read per §2.2. The service still exposes a plain signal; bootstrapping is lazy-on-first-access as before.

Add a small harness at app bootstrap that calls `participantIdService.ensureLoaded()` on `APP_INITIALIZER` so screens never see a transient `null`.

### 3.7 Client: Awareness + online presence

`DocService` opens a subscription to the sync provider's `awareness.on('change', ...)` and maintains `onlineParticipantIds: WritableSignal<ReadonlySet<string>>`. Derived signals:

- `onlineParticipants` — `participants().filter(p => onlineParticipantIds().has(p.id))`.
- `offlineParticipants` — the complement. Rendered dimmed.

Consumers updated:
- **Lobby participant list** — each row gets an `offline` class when the ID isn't in awareness.
- **Estimating avatar row** — renders `onlineParticipants` only. The votedIds set is derived from `round.votes` but filtered against awareness so a disconnected voter doesn't keep showing "voted."
- **Revealed voter chips** — rendered as-is (the vote was cast; presence at reveal time doesn't retract it). No awareness filter.

The `didntVoteNames` computation in Revealed already handles "in participants but missing vote" — no change needed.

### 3.8 Client: Jump-back-in banner

`home.page.ts` gains a banner above the action buttons when `hnch.lastSession` resolves to a valid cache entry:

- Renders `"Rejoin {roomCode} — {lastScreen}"` with a close button to discard.
- Tap → sync provider's join path with the cached uuid (skipping `GET /rooms/:code` since we have the uuid; a fast-path for the common case). On `unknown-room` close from the WS: clear the cache, toast, stay on Home.
- The cache gets written on every successful screen navigation within the session (Lobby / Estimating / Revealed — `lastScreen` + `lastSeenAt` updated) and cleared on Leave per §2.3.

### 3.9 Client: reconnection semantics

`y-websocket` reconnects automatically on blips. We expose the connection state as a signal off the sync provider:

- `connected` — happy path, nothing rendered.
- `connecting` — subtle status chip in the Lobby / Estimating toolbar (per `ux.md` §5.4).
- `disconnected` for >5s — the chip becomes a muted warning. No forced navigation; the doc is still usable from local state.

Phase 3 does not auto-navigate anyone out on disconnect. "Relay says room is gone" is a distinct signal (close code from the handshake) and *does* force a nav back to Home + cache clear.

### 3.10 Relay: snapshot rehydration & tests

`y-websocket/bin/utils`'s setup helper already handles sync-step-1/2 against the relay-side `Y.Doc`. Our only responsibility:

- On `WS /ws/:uuid` accept, ensure `RoomRecord.doc` exists (creating an empty one on first connect for a newly-minted room).
- On `connection.close`, decrement `connections`; if it hits 0, stamp `lastEmptyAt` and let the TTL sweeper do the rest.
- Test: a headless test in `packages/relay/test/snapshot.test.ts` spins up two ephemeral Yjs peers over a loopback WS, closes both, reconnects one after a short delay, and asserts the reconnecting peer receives the prior state.

### 3.11 Tests

`@hnch/shared` stays framework-free Vitest as before. Phase 3 adds:

- `packages/relay/test/*` — Vitest on Node, using `ws` + a `Y.Doc` driver to exercise the server end-to-end without a real browser. Targets: code-pool recycling, snapshot TTL, permissive-mode accept/reject, `GET /rooms/:code` behavior, `POST /rooms` idempotency (or lack thereof).
- `packages/client` still has no component tests. The sync-provider wrapper gets a narrow unit test in the shared-style Vitest path if the logic ends up non-trivial enough to warrant it (likely yes — the URL-construction + rejection-mapping code is the bug-prone part).

## 4. Commit plan

Small, bisectable, green at each step. Every commit ends with `ng build` + `ng lint` clean in client, `tsc --noEmit` clean in all three packages, and `vitest run` green in shared + relay.

1. **`Add ADR-0016 for the client ↔ relay connection handshake`** — documentation only. No code changes. Status: Proposed → Accepted on merge.
2. **`Scaffold packages/relay with health endpoint`** — `package.json`, `tsconfig`, `src/index.ts`, `src/server.ts`, `GET /health`. Vitest harness stood up but empty. Root `pnpm dev` script updated to run client + relay together.
3. **`Add relay room store + code/UUID minting`** — in-memory `RoomRecord`, `byUuid` / `byCode` indexes, `POST /rooms` + `GET /rooms/:code`. Unit tests on code collision retry + unknown-code response.
4. **`Wire y-websocket forwarding with snapshot rehydration`** — `WS /ws/:uuid`, `setupWSConnection`, `RoomRecord.doc` lifecycle, 24-hour TTL sweeper. Integration test: two headless Yjs peers sync across the relay; a third peer joins after both leave and sees the snapshot.
5. **`Wire client sync provider and Create Room`** — `sync-provider.ts`, Home's Create flow now mints through the relay, Lobby displays the relay-assigned code. Deletes the Phase 2 pseudo-code fallback.
6. **`Add Join Room screen + code entry`** — `join.page.ts`, route, unknown-room handling, Phase 2 nav wiring from Home's Join button (which currently dead-ends).
7. **`Swap ParticipantIdService to Capacitor Device with migration`** — Phase 2 UUID stub becomes a fallback for legacy keys; fresh installs use `Device.getId()`.
8. **`Add awareness-driven online presence + ghost rendering`** — `onlineParticipantIds`, Lobby dimming, Estimating avatar-row filter. No behavior change yet on Revealed (chips intentionally non-filtered).
9. **`Add Jump-back-in banner on Home`** — `hnch.lastSession` cache, banner UI, fast-path rejoin, unknown-room recovery.
10. **`Polish connection-state chip + exit-bar verification`** — the status chip in Lobby/Estimating toolbars, final audit against §6.

## 5. Out of scope for Phase 3

Explicit non-goals so scope doesn't drift:

- Password / invite enforcement (permissive mode only). Phase 5.
- Share sheet, QR display, QR scanner, universal / deep links. Phase 5.
- Timer-driven auto-reveal. Phase 4.
- Host election + "Alice is now hosting" toast. Phase 4.
- On-disk snapshot persistence (in-memory only is the accepted trade per [ADR-0012](../adr/0012-snapshot-policy.md)). Possible v2.
- Relay rate limiting, DDoS mitigation, structured logging. Deferred until operational need.
- Durable session persistence on the client (Capawesome SQLite / IndexedDB per [ADR-0004](../adr/0004-local-persistence-sqlite-indexeddb.md)). Phase 6.
- Settings screen's real content (display-name editor, theme picker). Phase 6.
- Haptics. Phase 6.
- Angular component / UI tests. Phase 6 at earliest (and per [`roadmap.md` §9](../roadmap.md#9-cross-cutting-concerns), may stay deferred past v1).

## 6. Exit bar

From [`roadmap.md` §5](../roadmap.md#5-phase-3--relay--multi-client-sync), unmodified:

> Two browsers (or browser + simulator) on different machines / ports can create/join a room via manual code entry, both see each other in the participants list, and either can observe the other's Round / vote state updating in real time. Manual reveal works across clients.

Smoke-test recipe:

1. `pnpm install && pnpm dev`. Client on :4200, relay on :1234.
2. Browser A onboards (display name = `Alice`) → Home → Create Room. Expect Lobby, a real 6-char code (no dashes in the stored form), Alice as sole participant, connection chip green.
3. Browser B (private window or different profile) onboards (display name = `Bob`) → Home → Join Room → enter the code → Join. Expect Bob's Lobby to show both Alice and Bob; Alice's Lobby to show Bob appear.
4. Alice changes scale to T-shirt. Bob's subtitle updates live.
5. Alice taps Start Round 1 with descriptor "payment refactor" → Bob's screen follows to Estimating.
6. Both vote — Alice picks `M`, Bob picks `L`. Each side's avatar row shows `● 2 of 2 voted` within ~200ms.
7. Alice taps Reveal Votes. Both screens flip to Revealed showing the `M` group (Alice) and the `L` group (Bob).
8. Bob closes his tab. Alice's participant list dims Bob (ghost). Alice taps Re-vote → Alice's Estimating shows only Alice in the avatar row.
9. Bob reopens Home, taps the Jump-back-in banner. He lands on Lobby (or the current round, per `lastScreen`). Awareness reacquires him; Alice's list un-dims Bob.
10. Leave Lobby on both clients. Wait briefly. Re-join from Alice with the same code. Expect the relay's in-memory snapshot to rehydrate the round history (ADR-0012).

## 7. Risks

- **Handshake rejection UX under dropped connections.** `y-websocket`'s default reconnect loop will retry forever on a transient close. We need to distinguish "transient network" from "relay said unknown-room" cleanly — ideally via the WS close code — and only the latter should clear the cache. Mitigation: the ADR-0016 close-code table is deliberately small; we pin a value for `unknown-room`.
- **Awareness flicker.** `y-websocket`'s awareness drops a peer's entry immediately on disconnect, but restores it on reconnect — this can look like Bob blinking offline during a 1-second blip. Consider adding a small debounce on the *offline* transition (not the online one) if the flicker is visible in the smoke test. Documented as a TODO on the signal if we don't fix it in Phase 3.
- **Snapshot memory footprint under test.** At the scale targeted by v1 (small teams, few concurrent rooms) the per-room doc is tiny; this only becomes interesting at far higher concurrency than we're planning for. Worth watching but not engineering against.
- **Device plugin on web.** `Device.getId()` on web returns a generated UUID persisted via Capacitor's plugin storage, which is equivalent to what we were already doing manually. The migration read handles the handoff; the risk is limited to making sure the APP_INITIALIZER path actually waits for the async read before the first screen renders.
- **Relay restart mid-Phase-3.** Development will involve restarting the relay frequently. In-memory snapshots go with it per [ADR-0012](../adr/0012-snapshot-policy.md); this is fine functionally but adds a papercut to the dev loop (you lose live sessions on every file edit). Mitigation: accept as dev-only friction; the `hnch.lastSession` cache plus `unknown-room` path handles it gracefully.

## 8. Parking lot

Ideas surfaced while planning Phase 3 that are out-of-scope but worth remembering:

- **`DocProjection` wire type exported from `@hnch/shared`.** Already listed in Phase 2's parking lot; the relay snapshot path is the first concrete consumer. Still not urgent — the relay never projects, it just forwards bytes — but the ergonomics of "one canonical projection type used on both sides" would be pleasant for any future debug tooling (e.g. a readable snapshot dump).
- **Structured relay logging.** Currently out of scope (§5), but Phase 3 is the point at which we'd start wanting it. A single `console.log` → `pino` migration can land in Phase 4 or 5 as operational need emerges.
- **`ConnectionChip` component.** The status chip (§3.9) is the first shared bit of UI chrome that lives on multiple screens. If the Phase 4 / Phase 5 work adds more status surfaces, extract it as a standalone Ionic-flavored component; until then, two copies are fine.
- **Relay snapshot export endpoint for debugging.** Admin-only read of a room's current opaque binary blob. Unnecessary for v1; cheap to add if user-reported bugs ever need "what did the doc actually look like" triage.
