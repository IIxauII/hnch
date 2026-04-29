# ADR-0026: Deep-link URL format — `${appBaseUrl}/join?code=XXXXXX`

**Status:** Proposed — origin clause superseded by [ADR-0030](0030-canonical-origin-hnch-dev.md) (canonical origin is `https://hnch.dev`, not `https://hnch.app`); Decision §1 (origin clause) further superseded by [ADR-0031](0031-runtime-origin-for-invite-urls.md) (origin is read from `window.location.origin` at link-mint time, no build-time constant); all other clauses remain in force
**Date:** 2026-04-26
**Deciders:** Xau

## Context

Once a host creates a room they need to share it with the rest of the team. The user-facing channels for that share are: copy-paste into Slack / SMS / email, a QR code (presented by the host's device, scanned by everyone else), and — once the iOS native build lands ([`roadmap.md`](../roadmap.md) Phase 6b) — Apple universal links via an Apple App Site Association (AASA) file. All three channels carry the **same URL string**, which makes the URL itself a public contract: once a QR code is printed on a meeting-room poster or pasted into a thread, every later deploy must keep the link working.

The decision under this ADR is the shape of that URL — path, query parameters, normalization rules, and the relationship between the URL and credentials. The 6-character room-code format is settled by [ADR-0008](0008-room-code-format.md); the access-control story is settled by [ADR-0009](0009-access-control-relay-tokens.md) / [ADR-0017](0017-password-hashing-drop-invite-only.md); the resolve→connect handshake by [ADR-0016](0016-client-relay-connection-handshake.md). What is *not* yet pinned is how the human-shareable artifact looks.

The implementation has converged on `${appBaseUrl}/join?code=XXXXXX` (no dashes, case-insensitive, password never present). The URL is consumed by the existing `JoinPage`, which auto-fills the code field and auto-submits the join when the URL parameter is present. AASA universal-link binding will use the same path. This ADR records the format and the rules so the next contributor doesn't accidentally rewrite half of them.

A reasonable contributor could have picked a different path (`/r/XXXXXX`, `/room/XXXXXX`), embedded the password (`?code=K7P9MR&pw=...`), used hash routing (`#/join/...`), or normalized differently (require dashes, preserve case). Each of those would change either the security posture, the link's printability, or the AASA binding — all reasons to write the ADR.

## Decision

1. **URL shape.** The deep-link / invite URL is `${appBaseUrl}/join?code=XXXXXX`, where:
   - `appBaseUrl` is the deployed origin: `http://localhost:4200` in development, `https://hnch.app` in production. The value is sourced from `packages/client/src/environments/environment{.prod}.ts`.
   - `/join` is a single-level path. No nested route, no segment-encoded code (`/r/CODE` was considered and rejected — see Options below).
   - `code` is a query parameter, not a path segment. The value is the 6-character room code per [ADR-0008](0008-room-code-format.md).

2. **Normalization rules — be liberal in what we accept, exact in what we mint.**
   - The URLs we mint use the canonical form: uppercase, no dashes, no whitespace (e.g., `K7P9MR`).
   - The URLs we accept run through `normalizeRoomCode` (`packages/shared/src/room-code.ts:54`), which strips dashes, trims surrounding whitespace, and uppercases. So `?code=k7p9-mr`, `?code= K7P9-MR `, `?code=K7P9MR`, and a paste with a stray newline all resolve to the same room. (Whitespace-trim is the prescribed behavior of this ADR; the current `normalizeRoomCode` implementation does not yet trim — gap-closing tracked as Action Item below.)
   - This matches the in-app code-input box's normalization, so a code typed by hand and a code arriving via deep link go through the same canonical path before reaching the [ADR-0016](0016-client-relay-connection-handshake.md) handshake.

3. **Auto-fill + auto-submit on landing.** When `JoinPage` is opened with a `?code=…` query parameter, it pre-fills the code field and auto-submits the join. This is the difference between "I tapped a link" and "I'm visiting the join page" — the former should produce a join attempt without user intervention. The auto-submit happens unconditionally on the resolve step (`GET /rooms/:code`); for **open** rooms the handshake completes and the user lands inside; for **password-protected** rooms the resolve returns `accessMode: 'password'` and the join sheet pauses on the password input rather than auto-submitting the WS connect. The user does not have to do anything extra to *try* — the only manual step on a password-protected room is supplying the password the link could not safely carry. Direct navigation to `/join` with no query parameter shows the empty form (no auto-submit). The `displayNameGuard` may intercept and stash the deep link for post-onboarding resumption — that is correct and is documented at [`packages/client/src/app/app.routes.ts`](../packages/client/src/app/app.routes.ts).

4. **Password is NEVER in the URL.** Password-protected rooms ([ADR-0017](0017-password-hashing-drop-invite-only.md)) require the password to be supplied by the joining user, not transmitted as part of the link. Reasons:
   - URLs land in copy-paste history, browser address bar, browser history, server access logs upstream of our code, screenshots, and analytics that the recipient's devices may have. A password riding in the URL is a credential leak surface for every one of those channels.
   - The PBKDF2 hash defined in [ADR-0017](0017-password-hashing-drop-invite-only.md) is opaque on the wire, but caching it in URL history is still a "stolen URL → joinable room" capability we don't want.
   - The auto-submit flow handles this gracefully: when the join handshake returns `wrong-password` (close code `4002` per [ADR-0016](0016-client-relay-connection-handshake.md)), the UI surfaces a password input rather than failing with the auto-flow error.
   - This is a security-relevant decision, not a UX one. A future "remember password in URL" toggle would need a new ADR with an explicit threat-model section.

5. **Public-contract immutability.** The URL shape is a **public contract**. Once any of these shapes have been committed to a printed QR code, a Slack thread, or an AASA file:
   - `/join` path, `code` parameter name, dash-stripping normalization, case-insensitive resolution.
   - The base origin `https://hnch.app` once production ships.
   Changes to the shape must keep the old form working — typically by accepting both forms and minting only the new — never by breaking-change. A change that breaks the old form requires a new ADR plus a deprecation window.

6. **AASA / App Links target binding (forthcoming, Phase 6b).** The iOS universal-link AASA file at `https://hnch.app/.well-known/apple-app-site-association` will register `/join` as an iOS-handled path; the equivalent Android App Links manifest will mirror it. The exact AASA / Android assetlinks contents are out of scope for this ADR (they are platform-specific build artifacts), but the path-shape commitment recorded here is the binding both files will reference. Changing the path would require a new AASA payload, an iOS app rebuild, and accept-both-forms client logic for the deprecation window. **Path-prefix exclusivity:** because Apple's universal-link matching is path-prefix-based, `/join` MUST remain the *only* `/join` family route. Adding `/join/foo` or `/join/admin` later would split universal-link handoff between the OS and the browser in unpredictable ways. Future routes that need to share the verb should use a sibling (e.g., `/connect`, `/r`), not a child of `/join`.

7. **CLI does not parse URLs — `hnch join CODE` takes the code directly, but MUST apply the same normalization.** The CLI ([ADR-0021](0021-cli-package.md)) has no URL routing layer and no browser to follow links. A user on the CLI runs `hnch join K7P9MR` (or `hnch join k7p9-mr` — the same `normalizeRoomCode` rule applies, dash-strip + whitespace-trim + uppercase). (Whitespace-trim is the prescribed behavior of this ADR; the current `normalizeRoomCode` implementation does not yet trim — gap-closing tracked as Action Item below.) The CLI's positional `code` argument MUST be passed through `normalizeRoomCode` from `@hnch/shared` before the resolve step — *not* a hand-rolled `.toUpperCase()` or `.trim()` — so that `hnch join k7p9-mr`, `hnch join K7P9MR`, and a URL-derived `?code=K7P9-MR` all hit the same canonical room. Anything less than the full normalization (e.g., uppercase-only) silently breaks parity with the URL surface and is a bug. The CLI does **not** accept a full URL as the argument; if a user pastes a `https://hnch.app/join?code=…` URL the CLI errors with a hint to pass just the code. This keeps the CLI's argument surface predictable and avoids the CLI having to ship a URL parser whose acceptance criteria would have to track the public contract recorded above. The mobile/PWA client and the CLI therefore consume the same *room code* via different surfaces (URL query parameter vs. positional arg) and MUST agree on the normalization.

## Options Considered

### Option A: `/join?code=XXXXXX`, query parameter, no password (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Printability | High — short, dense, clear |
| AASA binding | Single path, easy |
| Credential leakage | None — password never in URL |
| Team familiarity | Standard |

**Pros:** the path is short and human-readable; the query parameter convention is familiar to anyone who's clicked a tracking link; QR encoding is dense; the `/join` path is a single AASA entry to bind. Auto-fill + auto-submit "just works" because the parameter parses cleanly. Normalization at the input shares one code path with manual entry.
**Cons:** query parameters appear in URL logs upstream of our code (proxy logs, browser histories) — but the room code alone is a low-secret value (6 chars, ADR-0008 retirement-with-snapshot makes it low-replay), and the password is not present.

### Option B: `/r/XXXXXX` (path-segment code)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Printability | Higher — even shorter |
| AASA binding | Slightly more complex (path component) |
| Credential leakage | Same as A |
| Team familiarity | Standard |

**Pros:** shorter still — saves three characters in QR density. Path-segment URLs feel "cleaner" to some readers.
**Cons:** the path component is an opinionated route shape that's harder to extend. If we ever add another query parameter (e.g., `?nick=…` for a pre-filled display name), we either bolt it on inconsistently or rework the route. The `/join?code=…` shape composes more naturally; we lose three characters but gain easy extension. Path-segment routes also play poorly with web-server static-prerendering setups some hosts use.

### Option C: Hash routing — `/#/join?code=XXXXXX`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — Angular router supports it, but we don't use it elsewhere |
| Printability | Same as A but visually noisier |
| AASA binding | **Broken** — iOS universal links don't follow URL fragments |
| Credential leakage | Slightly better (the fragment doesn't go to upstream proxies) |
| Team familiarity | Lower |

**Pros:** the fragment portion is not sent to the server, which means proxy access logs upstream of our code don't see the room code at all.
**Cons:** **AASA universal links don't activate on URL fragments** — this would break Phase 6b's iOS deep-link story for no real benefit (the room code is low-secret and the password isn't in the URL anyway). Angular's hash-routing mode would also cut against the rest of the app's path-routing convention.

### Option D: Embed the password — `?code=XXXXXX&pw=<hash>`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Printability | Lower — URLs are now long |
| AASA binding | Same as A |
| Credential leakage | **High** — password hash in copy-paste history, browser history, screenshots |
| Team familiarity | Standard |

**Pros:** "share this link, the recipient is in" — single-tap join even for password-protected rooms.
**Cons:** the password hash riding in URLs is captured by every URL-logging system the link touches between sender and recipient. The PBKDF2 hash is opaque but it *is* a credential — the relay accepts it as proof of password knowledge ([ADR-0017](0017-password-hashing-drop-invite-only.md)). A leaked hash is a usable credential. The auto-flow + close-code-driven re-prompt in Option A delivers acceptable UX without paying this cost.

## Trade-off Analysis

Option A wins on three independent axes: (a) the shape composes cleanly with future query parameters and AASA binding, (b) it doesn't carry credentials, and (c) it matches a convention every recipient already understands without explanation. The other options each fail on one of those axes. Option B saves three characters at the cost of route extensibility; Option C trades a marginal proxy-log hygiene gain for breaking the iOS universal-link story; Option D buys one less prompt at the cost of a credential leak in every URL log.

The "no password in URL" call deserves its weight. The mobile client's join sheet is well-equipped to prompt for a password and to surface "wrong password" via the existing close-code path. The CLI's `hnch join` already takes a `--password` flag. Neither needs the URL to carry the credential. Cross-channel sharing — Slack, SMS, screenshots — is exactly the place where credentials in URLs leak; declining to put them there is the cheapest possible mitigation.

The normalization rule (liberal accept, exact mint) is a small but important commitment. Users will mistype, autocorrect will lowercase, copy-paste from a printed QR will sometimes preserve a hyphen-as-line-wrap. Accepting all of those normalizes them to the same canonical form, so the link works regardless of which lossy channel it traveled. The corresponding mint side of the rule — *we* always emit the canonical form — keeps copy-paste outputs predictable for users who want to verify visually that the link they're sending is the one they think they're sending.

The public-contract framing is the load-bearing claim. URLs in QR codes on a printed poster outlive any code change we make. AASA bindings outlive any deploy after they're cached. The ADR exists to make breaking changes expensive — they require a successor ADR and a deprecation window, not a quick refactor.

## Consequences

**Easier:**
- One canonical link shape for every channel: copy-paste, QR codes, AASA universal links.
- Auto-fill + auto-submit gives the "tap a link, you're in" feel for open rooms; password-protected rooms gracefully fall back to a UI prompt without the user noticing they took two steps.
- The shared `normalizeRoomCode` path means manual entry and deep links cannot disagree about which room they refer to.
- AASA binding in Phase 6b is a single-path commitment — register `/join` and we're done.

**Harder:**
- Changes to the URL shape are no longer free. Any rename of `/join`, `code`, or the normalization rules requires accepting both forms during a deprecation window plus a successor ADR. This is the right friction for a public contract.
- Query parameters appear in upstream URL logs (proxies, browser histories). The room code is the only thing we put there, and ADR-0008's retirement-with-snapshot policy bounds the replay window, but operators reading their access logs should expect to see codes there.
- An attacker who shoulder-surfs a QR code captures the code (no surprise — that's the whole point of sharing it) but does **not** capture the password, which is by design. The "you sent a Slack link from your unlocked machine" threat needs the host to know the password is requested by the joiner, not riding along with the URL.

**Revisit triggers:**
- Demand to embed a pre-filled display name or other join-time hint in the link → straightforward extension with a new query parameter (`?code=…&nick=…`); does not require a new ADR unless the new parameter is security-relevant.
- Demand to support custom domains (e.g., a self-hosted instance of hnch under a different origin) → re-evaluate the role of `appBaseUrl` in the public contract; AASA bindings would need to follow the custom origin.
- Real demand to support QR codes that can carry the password (e.g., handing a tablet across the room with a one-tap-join QR) → would need a new ADR with an explicit threat model — the answer is probably "no" but the question deserves an explicit refutation.
- Apple changing AASA semantics or adopting a successor format → re-evaluate the iOS binding details; the path-shape commitment here is the input the new format will need.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the deep-link contract.
- [ ] Cross-link from [ADR-0016](0016-client-relay-connection-handshake.md) (typo-class addition) noting that the deep-link form `?code=…` is the user-facing entry point that resolves into the `GET /rooms/:code` handshake.
- [ ] Cross-link from [ADR-0008](0008-room-code-format.md) (typo-class addition) noting the case-insensitive / dash-stripping normalization at the URL boundary as part of the public contract.
- [ ] Cross-link from [ADR-0017](0017-password-hashing-drop-invite-only.md) (typo-class addition) noting that passwords MUST NOT appear in deep-link URLs per this ADR.
- [ ] Cross-link from [ADR-0021](0021-cli-package.md) (typo-class addition) noting that the CLI's `hnch join CODE` is the platform-divergent equivalent of the deep-link URL — same room code, same normalization, different surface.
- [ ] CLI: replace `argv.code.toUpperCase()` at [`packages/cli/src/index.ts:114`](../packages/cli/src/index.ts) with `normalizeRoomCode(argv.code)` from `@hnch/shared` for parity with URL normalization (dash-strip + whitespace-trim + uppercase). Without this, `hnch join K7P9-MR` fails unknown-room while the URL form `?code=K7P9-MR` succeeds. Tracked under impl task T28.
- [ ] Add `.trim()` to `normalizeRoomCode` at [`packages/shared/src/room-code.ts:54`](../packages/shared/src/room-code.ts): `return input.trim().replace(/-/g, '').toUpperCase()`. Update the JSDoc on line 50 to reflect "strips dashes, trims surrounding whitespace, converts to uppercase". Add a unit test in `packages/shared/src/room-code.test.ts` covering inputs with leading/trailing whitespace and embedded newlines so the prescribed-behavior contract has test coverage. Tracked under impl task T29.
- [ ] Document the URL contract in user-facing docs ([`project.md`](../project.md) or a new section / sharing doc) so non-developers sharing rooms know what to expect.
- [ ] When the iOS native build (Phase 6b) lands, write the AASA payload at `https://hnch.app/.well-known/apple-app-site-association` registering `/join` and verify a real iOS device performs the handoff.
- [ ] Verify [`ux.md`](../ux.md) describes the auto-fill + auto-submit behavior so a future UX revision doesn't accidentally remove it as "redundant".
- [ ] Verify [`packages/e2e`](../packages/e2e) has at least one test that exercises a deep link with `?code=…` end-to-end (auto-fill + auto-submit + successful join). If absent, file a test follow-up.
