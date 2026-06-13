# ADR-0026: Deep-link URL format — `${appBaseUrl}/join?code=XXXXXX`

**Status:** Accepted (origin clause superseded by ADR-0031)
**Date:** 2026-04-26

## Context

- Host shares room via copy-paste, QR code, and (Phase 6b) Apple universal links — all carry the same URL string.
- URL is a public contract: once printed in a QR or AASA-bound, every later deploy must keep it working.
- 6-char room code settled by [ADR-0008](0008-room-code-format.md); access control by [ADR-0009](0009-access-control-relay-tokens.md) / [ADR-0017](0017-password-hashing-drop-invite-only.md); handshake by [ADR-0016](0016-client-relay-connection-handshake.md). URL shape itself unpinned until now.

## Decision

URL is `${appBaseUrl}/join?code=XXXXXX`. Single-level path, query param (not segment). Liberal accept via `normalizeRoomCode` (dash-strip + whitespace-trim + uppercase); exact mint (canonical uppercase, no dashes). Auto-fill + auto-submit on landing — open rooms join; password-protected pause on password input (no password ever in URL). Public-contract immutable: `/join` path, `code` param name, normalization rules. AASA path-prefix exclusivity: `/join` MUST remain the only `/join*` route. CLI takes positional code (not URL), MUST run through `normalizeRoomCode` from `@hnch/shared`.

## Trade-offs

- Query params land in upstream URL logs — only the room code, never the password.
- URL shape now expensive to change — rename of `/join` / `code` / normalization requires accept-both deprecation + successor ADR.
- Liberal-accept / exact-mint asymmetry pays off across lossy channels (autocorrect, hyphen-line-wrap, paste with newline).
- Hash routing (`/#/join`) rejected: AASA universal links don't activate on fragments — would break Phase 6b.
- Password-in-URL rejected: PBKDF2 hash is a credential; URL logs/screenshots/history would capture it.

## Consequences

- Easier: one canonical shape across copy-paste / QR / AASA; auto-fill+auto-submit gives "tap link, you're in"; manual-entry and deep-link share the same `normalizeRoomCode`; AASA = single-path commit.
- Harder: shape is frozen — changes need deprecation window; upstream proxies see codes (acceptable).
- Revisit when: pre-filled hint params demanded (additive, no new ADR unless security-relevant); custom-domain self-hosting; demand to carry password (needs explicit threat model); AASA semantics change.
