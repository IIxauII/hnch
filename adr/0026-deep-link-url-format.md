# ADR-0026: Deep-link URL format — `${appBaseUrl}/join?code=XXXXXX`

**Status:** Accepted — Decision §1 (origin clause) superseded by [ADR-0031](0031-runtime-origin-for-invite-urls.md) (origin read from `window.location.origin` at link-mint time, no build-time constant); all other clauses remain in force
**Date:** 2026-04-26

## Context

- Host shares room via copy-paste, QR code, and (Phase 6b) Apple universal links — all carry the same URL string.
- URL is a public contract: once printed in a QR or AASA-bound, every later deploy must keep it working.
- 6-char room code settled by [ADR-0008](0008-room-code-format.md); access control by [ADR-0009](0009-access-control-relay-tokens.md) / [ADR-0017](0017-password-hashing-drop-invite-only.md); handshake by [ADR-0016](0016-client-relay-connection-handshake.md). URL shape itself unpinned until now.

## Decision

URL is `${appBaseUrl}/join?code=XXXXXX`. Single-level path, query param (not segment). Liberal accept via `normalizeRoomCode` (dash-strip + whitespace-trim + uppercase); exact mint (canonical uppercase, no dashes). Auto-fill + auto-submit on landing — open rooms join; password-protected pause on password input (no password ever in URL). Public-contract immutable: `/join` path, `code` param name, normalization rules. AASA path-prefix exclusivity: `/join` MUST remain the only `/join*` route. CLI takes positional code (not URL), MUST run through `normalizeRoomCode` from `@hnch/shared`.

## Options

- **A — `/join?code=XXXXXX` (chosen):** Pros: composes with future params (`&nick=…`); single AASA entry; clean QR; no credentials in URL. Cons: room code visible in upstream proxy logs (low-secret per ADR-0008 retirement).
- **B — `/r/XXXXXX` path-segment:** Pros: 3 chars shorter. Cons: harder to extend with query params; path-segment routes hostile to static-prerendering.
- **C — Hash routing `/#/join?code=…`:** Pros: fragment not sent to proxies. Cons: **AASA universal links don't activate on fragments** — breaks Phase 6b for marginal log-hygiene gain.
- **D — Embed password `?code=…&pw=<hash>`:** Pros: single-tap join. Cons: PBKDF2 hash is a credential; URL logs/screenshots/history capture it; close-code re-prompt delivers acceptable UX without the leak.

## Trade-offs

- Query params land in upstream URL logs — only the room code, never the password.
- URL shape now expensive to change — rename of `/join` / `code` / normalization requires accept-both deprecation + successor ADR.
- Liberal-accept / exact-mint asymmetry pays off across lossy channels (autocorrect, hyphen-line-wrap, paste with newline).

## Consequences

- Easier: one canonical shape across copy-paste / QR / AASA; auto-fill+auto-submit gives "tap link, you're in"; manual-entry and deep-link share the same `normalizeRoomCode`; AASA = single-path commit.
- Harder: shape is frozen — changes need deprecation window; upstream proxies see codes (acceptable).
- Revisit when: pre-filled hint params demanded (additive, no new ADR unless security-relevant); custom-domain self-hosting; demand to carry password (needs explicit threat model); AASA semantics change.

## Action Items

- [ ] CLI: replace `argv.code.toUpperCase()` at `packages/cli/src/index.ts:114` with `normalizeRoomCode(argv.code)` from `@hnch/shared`. Without it, `hnch join K7P9-MR` fails while URL `?code=K7P9-MR` succeeds.
- [ ] Add `.trim()` to `normalizeRoomCode` at `packages/shared/src/room-code.ts:54` → `return input.trim().replace(/-/g, '').toUpperCase()`. Update JSDoc + add unit tests for whitespace/newline inputs.
- [ ] Verify e2e test exercises `?code=…` deep link end-to-end (auto-fill + auto-submit + join).
- [ ] When Phase 6b lands, write AASA payload at `https://hnch.dev/.well-known/apple-app-site-association` registering `/join`.
- [ ] Clarification (issue #60): lobby's `inviteUrl` may append `&pw=1` advisory hint flag (binary, no credential) so join sheet renders password input on landing instead of waiting for `4002` round-trip. Not Option D — relay never reads it; clients ignoring it fall back via [ADR-0035](0035-wrong-password-rejection-uses-ws-close.md). Additive → §5 immutability preserved; AASA path-prefix matching unaffected.
