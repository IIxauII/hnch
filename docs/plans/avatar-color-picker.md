# Avatar color picker (issue #159)

Per-participant avatar color, user-selectable from a palette or custom hex, persisted device-local, published via the Yjs participant record.

## Decisions

| Topic | Choice | Rationale |
|---|---|---|
| Sync channel | `participant.avatarColor` field on Y.Map record | Survives reconnect; round-history avatars keep correct color for departed peers; matches ADR-0036 pattern. |
| Palette | Move existing `ACCENTS` (12 keys) from `packages/client/src/app/core/accent.tokens.ts` → `packages/shared/` and reuse | Already exists with ink/soft variants + dark overrides + WCAG-checked. Theme accent and avatar color remain independent settings, both keyed by `AccentKey`. |
| Custom hex | Allowed in addition to palette | Power-user friendly. Wire format widened. |
| Wire format | Single `string` field; shared `parseAvatarColor(s)` → resolved hex or `null` | Accepts `AccentKey` OR `#rrggbb`. One validator shared mobile + CLI. Doc stays small. |
| First-launch | Deterministic `hash(deviceId) % palette.length`, persisted immediately | Stable across reinstalls if deviceId stable; satisfies AC #5. |
| CLI UX | Full interactive Ink picker inside `hnch config` | Keyboard-nav list of swatches. Also accepts `--color <key|hex>` flag. |
| ADR | New ADR before code | Yjs schema shape change → CLAUDE.md mandates ADR. References ADR-0005 (device identity) + ADR-0036 (participant record). |
| PR/worktree | Single PR in worktree `avatar-color` | Scope contained; one Conventional Commit `feat(client,cli,shared)`. |

## Wire format

```ts
// packages/shared
export type AvatarColorValue = string; // AccentKey | `#rrggbb`
export function parseAvatarColor(v: string | undefined): string | null; // → resolved hex
export function deterministicAvatarColor(deviceId: string): AccentKey;
```

Doc field: `participants.get(deviceId).avatarColor?: string` (optional; readers fallback to deterministic hash of deviceId when absent → safe upgrade for pre-feature peers).

## Sequence

1. **ADR** — draft `adr/00XX-avatar-color.md`. Status: Proposed → Accepted after user OK.
2. **Worktree** — `pnpm worktree:add avatar-color` (fetch origin first).
3. **shared**
   - Move `accent.tokens.ts` → `packages/shared/src/accent-palette.ts`. Client re-exports for back-compat or imports from shared directly.
   - Add `parseAvatarColor`, `deterministicAvatarColor`, `AvatarColorValue` type.
   - Extend `ParticipantRecord` in `doc.ts` with optional `avatarColor?: string`.
   - Tests: validator (accent key, valid hex, invalid hex, undefined), determinism, WCAG AA contrast against light + dark chip bg for all 12 keys.
4. **client**
   - `IdentityService` (or equivalent): read/write `avatarColor` from `@capacitor/preferences`; on first launch with no value, call `deterministicAvatarColor(deviceId)` and persist.
   - `DocService`: write `avatarColor` to participant record on join + on change (no reconnect).
   - Settings page: palette grid (12 swatches with `aria-label="Racing Green"` etc.) + hex input field with live preview. Save persists Preferences and writes doc.
   - `avatar-vote-row.component` + lobby avatar rendering: read color from participant record (via DocService projection) → fallback `parseAvatarColor` → fallback deterministic.
   - Tests: settings picker selection, live preview, hex validation, avatar coloring snapshot.
5. **cli**
   - Add `--color <key|hex>` flag to `hnch config`.
   - Ink picker UI: interactive list of 12 swatches (rendered with ANSI bg) + "custom hex…" entry. Arrow keys + Enter.
   - `loadConfig()`: on missing `avatarColor`, deterministic-assign + persist.
   - Publish via same participant record write as mobile.
   - Tests: flag parses key + hex, deterministic first-launch, picker keyboard nav.
6. **e2e** — Playwright: two-client test that participant A changes color in Settings, B sees update within 2s on avatar row.
7. **PR** — title `feat(client,cli,shared): per-participant avatar color picker (#159)`. Body links ADR.

## Out of scope

Per issue: per-session overrides, server sync, avatar shape/image, color in URL.

## Open items

- Confirm ADR number (next free) when drafting.
- Confirm Preferences key name: `avatarColor` (no namespace, matches `displayName`).
