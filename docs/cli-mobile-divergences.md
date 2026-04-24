# CLI vs Mobile — Feature Divergences

Updated 2026-04-24. Compares `packages/cli` and `packages/client` for functional gaps. Platform-appropriate differences (QR, haptics, theme picker, deep links, share API) excluded.

## CLI missing (mobile has)

| Feature | Detail |
|---------|--------|
| Session resume | Mobile caches last session (room UUID, code, credentials) in Capacitor Preferences, offers "Jump back in" banner on Home if <24h old. CLI has `hnch resume` but no automatic prompt. |
| Host change notification | Neither platform notifies — listed under "both missing" below. |

## Mobile missing (CLI has)

| Feature | Detail |
|---------|--------|
| Room name edit in session settings | CLI exposes room name in lobby settings panel. Mobile session settings sheet does not surface it. |
| Preset overrides UI | CLI config allows per-preset card disabling (toggle individual cards off). Mobile has no equivalent UI. |
| Custom scale persistence | Mobile can create custom scales in-session but they are not persisted to device storage — lost on app restart. CLI persists to config file. |
| Relay URL override | CLI exposes relay URL in config. Mobile hardcodes it in environment config. |
| Default session name preference | CLI config supports a default session name applied to new sessions. Mobile has no equivalent. |
| Default password preference | CLI config can toggle password-by-default for new sessions. Mobile has no equivalent. |

## Both missing

| Feature | Detail |
|---------|--------|
| Host change notification | When host drops and election runs, neither platform notifies participants of the new host. |
| Manual host handoff | No mechanism for host to explicitly pass host role to another participant. |

## Platform-appropriate differences (not gaps)

These are intentionally different and should not be "fixed":

- Theme picker (mobile) vs terminal theme inheritance (CLI)
- QR code display/scan (mobile only)
- Deep link join (mobile only)
- Share API (mobile) vs printed invite command (CLI)
- Haptic feedback (mobile only)
- Reveal animation (mobile) vs instant display (CLI)
- Clipboard copy (mobile) vs terminal text output (CLI)
