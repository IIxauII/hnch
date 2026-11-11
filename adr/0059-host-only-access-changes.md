# ADR-0059: Host-only access changes — participant keys and a relay-held access holder

**Status:** Accepted (handoff holder-only clause superseded by ADR-0060)
**Date:** 2026-11-11

Supersedes ADR-0017's "no host auth on `PATCH /rooms/:uuid/access`" clause. Builds on ADR-0010, ADR-0016, ADR-0036, ADR-0048, ADR-0051.

## Context

- `PATCH /rooms/:uuid/access` sets or clears password with no caller check. `GET /rooms/:code` hands UUID to anyone with 6-char code, unrate-limited. ADR-0017 leaned on UUID unguessability; code lookup undoes it. Rooms persist 24 h after last use (ADR-0051) → long window. Anyone with code can open a password room or lock its participants out.
- ADR-0017 revisit trigger ("UUID leakage concern → host-auth tokens on mutating endpoints") has fired.
- Owner settled (#555, 2026-10-31): authority follows host *role*, not creating device. Elected or handed-off host gains it; old host loses it.
- `did` on WS upgrade = `participantId` = device ID (ADR-0005; CLI: random UUID in config). Visible to every participant → not a secret. Relay ignores it today.
- Doc writable by any admitted peer (ADR-0010), incl. `settings.hostParticipantId` and any participant's `leftAt`. Yjs client IDs are client-chosen and visible; pending structs integrate inside another socket's transaction; deletes carry no author. → Relay cannot soundly attribute a doc write to a participant.
- Host role moves three ways (docs/schema.md): creator seeds self; `handoffHost` by current host; election after host left eligible set for 5 s debounce, lex-lowest eligible id wins (ADR-0048).
- Released CLIs PATCH password right after `POST /rooms`, before any socket opens (salt = UUID, unknown before mint). Released native builds PATCH from lobby after join. Neither sends a key.
- Join-path close codes and password-oracle properties (ADR-0016, ADR-0035) must not change.

## Decision

Relay keeps its own **access holder** per room, moved only by events relay observes directly, never by doc writes. PATCH succeeds only for caller that proves its participant id with a **participant key**, is the access holder, and equals doc's `hostParticipantId`.

**Participant key.**
- Each device generates one 256-bit random device key, stored next to its `participantId` (client: device-ID store; CLI: config file). Never logged.
- Per-room key `pk = HMAC-SHA-256(deviceKey, roomUuid)`, hex. Sent as `pk` query param on WS upgrade; as `Authorization: Bearer <pk>` with `participantId` in body on PATCH and handoff. A leaked `pk` (URL logs, ADR-0016) is worthless outside its room.
- `POST /rooms` (and `POST /test/rooms`) body takes `creator: { participantId, deviceKey }`; relay derives `pk` itself after minting UUID. Raw device key reaches relay only in a request body.
- Relay stores per room `participantId → SHA-256(roomUuid ‖ pk)`, same idiom as password at rest. `pk` and device key must be 64 hex chars before use. Compare constant-time; unknown id compares against fixed dummy digest so bound vs unbound is not observable.
- Relay never logs `Authorization`, `pk`, device key, or digests.

**Binding.**
- First `pk` for a `participantId` binds it: creator at `POST /rooms`, everyone else at first **admitted** socket (after password loop and cap check) carrying `pk`. Refused sockets never touch binding table.
- `pk` digest computed after password verdict, before cap check (keeps "no await between cap check and accept"); binding table re-read after the await.
- Binding lives for room's life. ADR-0036 soft delete keeps id → binding survives leave, kick, re-join. Same device re-proves with same key: reconnect, CLI `resume`, "Jump back in".
- Binding table capped (several × room cap). At cap, new ids stay unbound → can never become holder.
- Socket attachment carries bound `participantId` (null when unbound); attachment overflow fallback drops presence only, never binding fields.
- Socket with wrong or missing `pk` still admitted (no new close code), just unbound. An id is **contested** while an admitted socket with that `did` and mismatched or missing `pk` is open; claim and handoff refuse a contested caller or target at that moment. No contest state persisted: pre-binding a known id fails while its real owner is connected, and denial lasts only as long as attacker sockets stay open (room cap bounds them).

**Access holder** (`accessHolder` in meta, additive).
- Set to creator at `POST /rooms` with `creator`; unset for keyless creates.
- **Handoff:** `POST /rooms/:uuid/host { participantId, target }` with holder's `pk`; route and body validated like PATCH, unknown room → same `404`. Holder-only; target must be bound, uncontested, with open bound socket, else `409 { reason: 'bad-target' }`, holder unchanged. On success holder = target. Client calls it **before** writing `handoffHost` to doc and writes doc only on `200`; otherwise no handoff, error shown.
- **Absence:** derived at each evaluation (socket open/close, PATCH, handoff) from `getWebSockets()`: open, admitted sockets whose attachment `participantId` = holder. None open and `holderAbsentSince` null → stamp now; one open → clear. Never relies on a close event (lost on DO restart/deploy, half-open sockets). `POST /rooms` with `creator` sets `holderAbsentSince = createdAt`.
- **Lapse:** now − `holderAbsentSince` ≥ 5 s on relay clock (ADR-0010 debounce) → holder unset. Also: holder's socket opens after any recorded absence while doc's `hostParticipantId` ≠ holder → holder unset (clients elected someone else meanwhile; avoids deadlock where holder isn't doc host and doc host can't claim).
- **Claim:** with holder unset, PATCH from caller C that is bound, uncontested, has an open bound socket, and equals doc's `hostParticipantId` (present, string) → holder = C, then PATCH applied. Covers election winner and pre-deploy rooms.
- Doc's `hostParticipantId` read only at PATCH and at holder rejoin, never trusted alone: forged value while holder set gains nothing.

**PATCH rule.** Validate body, `pk` format, digest (all awaits first), then one synchronous block: reload meta, tombstone check, absence/lapse evaluation, key compare, contested check, holder check (or claim), doc host check, write digest. Doc host check passes when doc's `hostParticipantId` = caller, or field absent and caller already holder (creator PATCHing before first socket seeds doc). Arrival order at DO decides PATCH vs handoff vs socket open/close. Refusals:
- `401 { reason: 'unauthenticated' }`: missing, malformed, or wrong `pk`; unbound id.
- `401 { reason: 'not-host' }`: right key, but not holder, contested, or not doc host.
- `400`/`404` unchanged.

**Released-client grace.** Keyless PATCH accepted once, only on room minted without `creator`, under 60 s old, that has never admitted a socket (`everAdmitted` in meta, set synchronously at accept; missing field on pre-deploy rooms reads true → no grace). Keeps released CLI `create --password` working. Any other keyless PATCH → `401 unauthenticated`.

**Relay surface.** CORS allows `Authorization`. `pk` query param ignored by older relays, so clients must ship after relay.

**Clients.** Web client and CLI show access control only while `hostParticipantId` = self; map `401 not-host` to "only the host can change the password".

## Trade-offs

- Relay reads one doc field, read-only, at PATCH and holder rejoin; first semantic doc read, narrow departure from ADR-0001.
- Relay's holder and doc's host can disagree (forged doc host, legacy-client handoff without relay call, relay lapse vs client eligible set). PATCH fails closed: nobody changes access until holder lapses and doc host claims. Accepted.
- After a lapse, any bound peer the doc names host can claim. An admitted malicious peer could forge doc host and claim first — same power ADR-0010 already gives it by choosing a lex-low device ID. Code-only outsiders in password rooms still can't.
- Rejoin-lapse (holder back while doc names another host) fires after any recorded absence, not only ≥ 5 s: admitted peer that forged doc host during a holder blip can then claim. Accepted to avoid permanent deadlock; same admitted-malicious-peer class as above.
- Lapse is a relay-side election stand-in: relay doesn't compute lex-lowest winner, defers to doc. 5 s blip → host keeps power; mobile app backgrounded > 5 s → power lapses, as host role does in doc.
- Handoff needs a relay call before the doc write; handoff from a released client leaves holder on old host until it lapses.
- Open room: anyone with code can fill binding table with fresh `did`s → later new ids can't become holder; or hold contesting sockets open to block a claim. Bounded by room cap and socket lifetime; no takeover.
- Released clients and pre-deploy rooms: no keys → cannot change access except via grace; pre-deploy rooms become claimable only by a keyed client named doc host.
- PATCH racing password check loop (room.ts) unchanged: three consecutive changes refuse join as `wrong-password`; only holder can cause it now.
- 60 s grace = narrow window where a code guesser could set password on a just-minted, empty, keyless room.
- `GET /rooms/:code` stays unrate-limited: code knowledge no longer grants access changes.

## Consequences

- Easier: password change gated on role; no doc-write attribution to get wrong; no new close codes; join path unchanged; one device key covers all rooms and resumes.
- Harder: relay grows binding table (SQL, ≤ one row per participant id ever admitted, capped), holder/lapse meta, handoff route; every surface stores device key and sends `pk`; test matrix gains forgery, blip, lapse/claim, contest, grace, timing-parity, legacy cases.
- Revisit when: signed host claims or device keys land (ADR-0010 revisit) → holder follows signed doc; released CLIs without key age out → drop grace; doc-forgery griefing after lapse observed → relay-side election via superseding ADR.
