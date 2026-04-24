# CLI vs Mobile — Feature Divergences

Updated 2026-04-24. Compares `packages/cli` and `packages/client` for functional gaps. Platform-appropriate differences (QR, haptics, theme picker, deep links, share API) excluded.

## CLI missing (mobile has)

| Feature | Detail |
|---------|--------|
| Session resume | Mobile caches last session (room UUID, code, credentials) in Capacitor Preferences, offers "Jump back in" banner on Home if <24h old. CLI has `hnch resume` but no automatic prompt. |

## Mobile missing (CLI has)

| Feature | Status | Detail |
|---------|--------|--------|
| Relay URL override | done | CLI exposes relay URL in config. Mobile now has Settings > Advanced > Relay URL override. |
| Default session name preference | done | CLI config supports a default session name applied to new sessions. Mobile now has Settings > Session Defaults > Default session name. |
| Default password preference | done | CLI config can toggle password-by-default for new sessions. Mobile now has Settings > Session Defaults > Password by default. |

## Implemented (both now have)

| Feature | Detail |
|---------|--------|
| Room name edit in session settings | CLI and mobile both expose room name editing. Mobile: Session settings sheet. |
| Preset overrides UI | Mobile settings now support per-preset card disabling (toggle individual cards off), matching CLI. |
| Custom scale persistence | Mobile now persists custom scales to device storage. |
| Manual host handoff | Both CLI and mobile now support manual host-to-participant handoff. Mobile: long-press participant card. CLI: `handoff` command. (Shipped 1418ef6) |

## Platform-appropriate differences (not gaps)

These are intentionally different and should not be "fixed":

- Theme picker (mobile) vs terminal theme inheritance (CLI)
- QR code display/scan (mobile only)
- Deep link join (mobile only)
- Share API (mobile) vs printed invite command (CLI)
- Haptic feedback (mobile only)
- Reveal animation (mobile) vs instant display (CLI)
- Clipboard copy (mobile) vs terminal text output (CLI)
