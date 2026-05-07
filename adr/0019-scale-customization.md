# ADR-0019: Scale customization — builtin presets, sentinel removal, device-local overrides

**Status:** Accepted
**Date:** 2026-04-23

## Context

- Shipped scales were Fibonacci + T-shirt, both with `?` / `☕` sentinels appended.
- Sentinels aren't estimates — pollute reveal results, conflate "don't know" with "break".
- Coverage gaps: powers-of-2, linear 1–10, risk scales common but absent.
- No per-team customization — teams stuck with closest builtin.
- Wire format constraint: round stores flat `{ id, cards }` (ADR-0013); customization must resolve client-side.
- Platform split: CLI uses `~/.config/hnch/config.json`; mobile uses Capacitor Preferences. No shared backend.

## Decision

Remove `?` / `☕` from builtins. Ship 5 presets (`fibonacci`, `t-shirt`, `powers-of-2`, `linear`, `risk`). Device-local customization via `PresetOverrides` (disabled-card-indices map) and `CustomScale` (id prefixed `custom-`, arbitrary cards). Client resolves to flat `{ id, cards }` before doc write — wire format unchanged. No cross-device sync, no sharing in v1.

## Options

- **A — Device-local overrides + custom scales (chosen):** config-layer storage. Pros: no server change, wire stays flat, no doc-schema change. Cons: scales don't roam across devices.
- **B — Custom scales in Yjs doc:** shared per session. Pros: all peers see same picker. Cons: ADR-0013 schema change, ephemeral per-session, conflates UI config with round state.
- **C — Cloud-synced library:** Pros: roams, supports team-shared presets. Cons: requires accounts (out of v1 scope per ADR-0005/ADR-0006), infra cost.
- **D — Sentinel removal only:** Pros: trivial. Cons: ignores coverage + customization gaps.

## Trade-offs

- Custom scales don't roam — laptop scale invisible on phone (round's flat cards stay authoritative, so reveal/scoring unaffected).
- Picker UI must merge builtin-with-overrides and custom entries.
- CLI `config scale` adds command surface.

## Consequences

- Easier: cleaner reveal analytics; non-standard teams adapt freely; relay/shared schema untouched.
- Harder: custom scales device-local only; picker logic handles two sources.
- Revisit when: cross-device sync demand → account-backed (touches ADR-0005/0006); session-shared scales → Option B (touches ADR-0013); >10 builtins → discovery UI.

## Action Items

- [ ] Remove sentinels + add 3 new presets in `packages/shared`.
- [ ] Define `PresetOverrides` / `CustomScale` types + resolver in `packages/shared`.
- [ ] Extend CLI config schema + `hnch config scale` subcommands.
- [ ] Add `ScalePreferenceService` + scale picker expansion + custom-scale editor on mobile.
- [ ] Document client-side types in `schema.md`.
