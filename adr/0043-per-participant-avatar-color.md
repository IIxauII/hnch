# ADR-0043: Per-participant avatar color (user-selectable)

**Status:** Accepted
**Date:** 2026-05-18

## Context

- Avatar dots in lobby + estimating row currently render with `--ion-color-primary` only — no per-participant differentiation. Identity cue = initials alone.
- Teams that estimate together regularly build visual shortcuts ("Alice = blue"). Auto-assigned hues drift across sessions if join order changes; near 20-peer cap ([ADR-0024](0024-participant-cap.md)) similarly-hued auto colors hard to distinguish.
- Display name already device-local via `@capacitor/preferences` ([ADR-0005](0005-device-identity-capacitor-device-plugin.md)). Color = same category of personal identity data.
- 12-entry `ACCENTS` palette already exists at `packages/client/src/app/core/accent.tokens.ts` for theme accent — pre-validated for WCAG AA, has `ink`/`soft` + dark overrides. Theme accent and avatar color remain orthogonal settings.
- Participant record schema ([ADR-0036](0036-participant-removal-lifecycle.md)) is the canonical per-peer doc data — readable mid-session, present in 24h snapshot ([ADR-0012](0012-snapshot-policy.md)), survives reconnect, intact in round-history reads.
- Relay content-blind ([ADR-0001](0001-networking-crdt-over-relay.md)) — color must flow via Yjs doc; no relay change.

## Decision

1. New optional field on Participant record: `avatarColor?: string`. Value = `AccentKey` (one of 12 palette keys) OR `#rrggbb` hex literal. Absent ⇒ fall back to deterministic-hash-of-deviceId palette index.
2. `ACCENTS` palette moves from `packages/client/src/app/core/accent.tokens.ts` → `packages/shared/src/accent-palette.ts`. Client re-exports unchanged for theme code; CLI imports same constant. Single source of truth.
3. Shared utilities in `@hnch/shared`: `parseAvatarColor(v): string | null` (returns resolved hex; accepts AccentKey or validated `#rrggbb`); `deterministicAvatarColor(deviceId): AccentKey` (stable hash → palette index).
4. Storage: `avatarColor` persisted device-local via `@capacitor/preferences` (mobile) / `~/.config/hnch/config.json` (CLI per [ADR-0021](0021-cli-package.md)). On first launch with no stored value, `deterministicAvatarColor(deviceId)` runs and result persisted immediately — color stable from first launch onward.
5. Wire write: client writes `avatarColor` into participant record on `joinSession` and on subsequent settings change. Mid-session edits write to doc (no reconnect needed); peers observe via existing participant Y.Map observer.
6. Custom hex allowed alongside palette per user request. Validator (`parseAvatarColor`) enforces `^#[0-9a-fA-F]{6}$`; failures fall through to deterministic default. WCAG contrast not enforced on custom hex — user-accepted risk.
7. CLI surface: full interactive Ink picker inside `hnch config` rendering 12 palette swatches with ANSI bg + "custom hex…" entry. Also `--color <key|hex>` flag.
8. No relay change. No new ADR for relay/protocol. Schema purely additive — pre-feature clients ignore field and render fallback.

## Trade-offs

- Adds field to participant record schema — readers must funnel through `parseAvatarColor` to tolerate missing/invalid values from old or hostile clients.
- Custom hex bypasses curated WCAG guarantee — a low-contrast user choice can hurt legibility on its own chip. Accepted: user owns visual choice.
- Theme `ACCENTS` move from client → shared = small refactor; client imports change but type/values identical.
- Awareness-only rejected: lost on disconnect; round-history avatars for offline / departed peers would lose color; same failure mode [ADR-0036](0036-participant-removal-lifecycle.md) cited for role-in-awareness.
- Discriminated-union wire format rejected: bloats Y.Map serialization; `string` + validator simpler and equally safe.
- Server-side color rejected: violates [ADR-0001](0001-networking-crdt-over-relay.md) content-blindness; no benefit over CRDT path.
- Per-session override rejected: contradicts stable-identity goal of the feature.

## Consequences

- Easier: visual recognition across recurring sessions; near-cap rooms get reliable hue distinction; round-history avatars colored consistently; CLI + mobile share single palette constant + validator.
- Harder: settings UI surface grows (palette grid + hex input); CLI gains an interactive Ink screen; one more device-local preference to migrate if storage format ever changes.
- Revisit when: demand for per-session colors (overrides) → new ADR layering ephemeral on persistent; demand for avatar images / shapes ([out of scope per issue](https://github.com/IIxauII/hnch/issues/159)) → larger media-handling ADR; WCAG complaint on custom hex → tighten validator + reject low-contrast values.
