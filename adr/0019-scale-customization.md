# ADR-0019: Scale customization — builtin presets, sentinel removal, device-local overrides

**Status:** Accepted
**Date:** 2026-04-23
**Deciders:** xau

## Context

The app shipped with two builtin estimation scales: Fibonacci and T-shirt sizes. Both included `?` (pass) and `☕` (coffee break) as special sentinel cards appended to every scale.

Several issues emerged from practice:

1. **Sentinel pollution.** `?` and `☕` are not estimates. Treating them as card options on every scale conflates "I don't know my estimate" with "let's take a break" — both meta-signals that should be expressed out-of-band (e.g. a raised hand, a message, stepping away). Including them in the card set inflates the reveal results and adds noise to vote analytics.

2. **Limited preset coverage.** Fibonacci and T-shirt cover most teams but not all. Powers-of-2 scales (1, 2, 4, 8, 16…) are common in engineering sub-teams. A simple linear 1-10 scale suits teams unfamiliar with Fibonacci. Risk scales (Low / Medium / High / Critical) appear in risk-assessment ceremonies. These are "obvious" presets that the app should ship with rather than require each team to recreate manually.

3. **No per-team customization.** Teams that have domain-specific card sets (e.g. a non-standard Fibonacci variant, a custom T-shirt sizing with XS/S/M/L/XL/XXL) currently have no way to adapt the scale. They must use the closest builtin and accept the mismatch.

4. **Wire format constraint.** The Yjs doc stores a flattened `{ id, cards }` per round (see ADR-0013). Any customization model must resolve to this shape before writing to the doc — the relay and peer clients must not need to know about client-side preset logic, disabled cards, or custom scale definitions.

5. **Platform split.** The CLI persists state in `~/.config/hnch/config.json`. Mobile uses Capacitor Preferences. Any customization model must fit both persistence surfaces without a shared backend.

## Decision

1. **Remove `?` and `☕` from all builtin scales.** They are not estimates and do not belong in card sets.

2. **Ship 5 builtin presets:** Fibonacci, T-shirt, Powers of 2, Linear 1–10, Risk. Each preset has a stable string ID (e.g. `fibonacci`, `t-shirt`, `powers-of-2`, `linear`, `risk`).

3. **Device-local customization via two mechanisms:**
   - **`PresetOverrides`:** a map of `scaleId → disabled card indices`. Users toggle individual cards off on any builtin preset. The resolved card set is `preset.cards` filtered to exclude disabled indices.
   - **`CustomScale`:** a user-defined object with a unique ID (prefixed `custom-`), a display label, and an arbitrary ordered `cards` array. Custom scales live alongside builtin presets in the picker UI.

4. **Wire format unchanged.** Before writing a round to the Yjs doc, the client resolves the selected scale (applying overrides or using the custom card list) to a flat `{ id, cards }` object. The doc, relay, and peer clients see only the flattened form. Customization is a pure client-side concern.

5. **Persistence is device-local only.** `PresetOverrides` and `CustomScale[]` are stored in the config layer for each platform: `~/.config/hnch/config.json` on CLI, Capacitor Preferences on mobile. There is no server-side or cross-device sync.

6. **No sharing or social features** for custom scales in v1. Custom scales are private to the device.

7. **Editing is available in two locations:** (a) the in-session settings panel (host can switch the scale for the next round), and (b) the app-level config / CLI `config` command (scales can be managed outside a session).

## Options Considered

### Option A: Device-local overrides + custom scales (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low–Medium |
| Cost | None |
| Privacy | No server involved |
| Platform fit | Config JSON (CLI) / Capacitor Preferences (mobile) |

**Pros:** customization lives entirely on the device; no server changes; wire format stays flat and backward-compatible; simple to implement and reason about; no sync complexity.
**Cons:** custom scales don't roam across devices; teammates must configure their own devices if they want consistent UI (though the Yjs doc always has the authoritative flat card list for the current round, so scoring/reveal is unaffected).

### Option B: Custom scales stored in the Yjs doc (shared per session)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium–High |
| Cost | None |
| Privacy | Scales visible to all session peers |
| Platform fit | Would work |

**Pros:** all participants see the same scale in their card picker, which is more consistent.
**Cons:** the Yjs doc schema changes (ADR-0013 would need a follow-up); scales would be ephemeral (doc is per-session); adds CRDT complexity for a setting that only the host meaningfully controls; doesn't address the app-level management use case.

### Option C: Cloud-synced custom scale library

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | Requires backend storage, accounts |
| Privacy | Server holds user-defined data |
| Platform fit | Needs accounts (not in v1 scope) |

**Pros:** scales roam across devices seamlessly; could support team-level shared presets.
**Cons:** requires accounts, which are explicitly out of v1 scope (ADR-0005, ADR-0006); adds infra cost; privacy implications for user-created data; far exceeds the v1 requirement.

### Option D: Remove sentinels, no other changes

| Dimension | Assessment |
|-----------|------------|
| Complexity | Minimal |
| Cost | None |
| Expressiveness | Low |

**Pros:** trivial to implement.
**Cons:** doesn't address limited preset coverage or per-team customization needs.

## Trade-off Analysis

Option A is the minimum that satisfies all four requirements (sentinel removal, broader presets, per-team customization, wire stability) without introducing server changes, account dependencies, or doc-schema changes. The device-local constraint is the main cost: a user's custom scale on their laptop won't appear on their phone. This is acceptable for v1 because the round's flat `{ id, cards }` is always authoritative in the doc — the card picker is a client-side affordance, not a correctness requirement. If cross-device roaming becomes a pain point, a superseding ADR can introduce account-backed sync then.

Option B (Yjs-stored) is superficially appealing for consistency but conflates "what scale are we using this round" (already in the doc as the flat card list) with "how does my card picker render" (a UI concern). Polluting the doc with client-side picker config is the wrong layer.

## Consequences

**Easier:**
- Reveal results and vote analytics are cleaner without sentinel cards muddying the distribution.
- Teams with non-standard workflows can adapt the card set without friction.
- The wire format and relay are unaffected — no changes needed in `packages/relay` or `packages/shared`'s Yjs schema.
- `PresetOverrides` is a lightweight map; `CustomScale[]` is a small array — both fit comfortably in config JSON or Capacitor Preferences.

**Harder:**
- Custom scales don't roam across devices. If a user sets up a custom scale on their laptop and joins from their phone, the phone won't show it in the picker (though the round in the doc still has the correct flat card list).
- The scale picker UI must handle both builtin (with override) and custom entries in the same list.
- CLI `config scale` subcommands add surface area to the config command.

**Revisit triggers:**
- Users requesting cross-device scale sync → consider account-backed storage (new ADR needed, touches ADR-0005/ADR-0006).
- Teams wanting a shared team-level scale visible to all session participants → consider Option B (Yjs-stored), new ADR needed, touches ADR-0013.
- More than ~10 builtin presets warranting a discovery/browse UI → address in UX, not schema.

## Action Items

- [ ] Remove `?` and `☕` from all builtin scale definitions in `packages/shared`.
- [ ] Add Powers of 2, Linear 1–10, and Risk presets to `packages/shared` builtins.
- [ ] Define `PresetOverrides` and `CustomScale` types in `packages/shared`.
- [ ] Add a scale resolution utility in `packages/shared` that takes (preset or custom, overrides) → flat `{ id, cards }`.
- [ ] Extend `~/.config/hnch/config.json` schema to include `presetOverrides` and `customScales`.
- [ ] Add `hnch config scale` subcommands for listing, enabling/disabling cards, and adding/removing custom scales (CLI).
- [ ] Add scale picker expansion to `SettingsPanel` in the CLI UI.
- [ ] Add `ScalePreferenceService` (mobile) to read/write overrides and custom scales via Capacitor Preferences.
- [ ] Expand the mobile scale picker to show all 5 presets plus custom scales, with per-card toggle UI.
- [ ] Add a custom scale editor sheet (mobile).
- [ ] Update `schema.md` to document `PresetOverrides` and `CustomScale` types (client-side, not Yjs schema).
