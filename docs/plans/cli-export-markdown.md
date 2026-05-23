# CLI: export session results as Markdown to clipboard

Issue: [#115](https://github.com/IIxauII/hnch/issues/115)
Scope: `packages/cli` only. No shared/relay/client changes.
Delivery: single PR, atomic commits.

## Context (verified)

- `roundsToMarkdown(input: RoundExportInput)` lives in `packages/shared/src/round-export.ts:140`. `participants` accepts `ReadonlyMap | Record`.
- Mobile path: `packages/client/src/app/core/export.service.ts` → `lobby.page.ts:956 copyResults()` passes raw `docService.participants()` (includes departed per ADR-0036) as a `Record`.
- CLI already imports `clipboardy` (`packages/cli/src/ui/App.tsx:7`, used at `App.tsx:273` for share). No new dep.
- Lobby `useInput` handler at `packages/cli/src/ui/Lobby.tsx:94`. Keybind legend rendered at `Lobby.tsx:316-352` (two branches: host with terminal round / host idle / non-host).
- Transient toast pattern: `useTransientNotice(3000)` (see `shareNotice` in `App.tsx:59`, render `App.tsx:302-308`).
- Lobby receives `rounds: readonly Round[]` + `projection.participants` already — no new props from session layer.

## Keybind choice

Reuse `x` (matches issue text). Conflict scan on Lobby active handler — used letters: `c, w, e, s, h, m, n, v, t, q, y`. `x` free.

## Worktree

```
git fetch origin
pnpm worktree:add cli-export-md main
cd ../hnch-cli-export-md
```

## Commits (atomic)

### C1 — `feat(cli): wire export-results action in App`

- Add `exportNotice = useTransientNotice(3000)` in `App.tsx`.
- Add `handleExportResults = useCallback(async () => { ... })`:
  - Compute `terminalRounds` (filter `terminalState(r) !== null`) — already computed locally; reuse.
  - Build `participantsRecord = Object.fromEntries(projection.participants.map(p => [p.id, p]))` (raw, includes departed — ADR-0036 parity).
  - `const md = roundsToMarkdown({ rounds: terminalRounds, participants: participantsRecord });`
  - `await clipboard.write(md)` → `exportNotice.show('Results copied to clipboard')`.
  - On throw: `exportNotice.show('Clipboard write failed')`.
- Pass `onExportResults` + `canExport` (≥1 terminal round) into `<Lobby>`.
- Render `exportNotice.notice` next to `shareNotice` block.

### C2 — `feat(cli): add [x] Export keybind to Lobby`

- Extend `Lobby` props: `onExportResults: () => void`, `canExport: boolean`.
- In `useInput` (Lobby.tsx:94): add `if ((input === 'x' || input === 'X') && canExport) { onExportResults(); return; }` — placed before host branch so non-host can also export.
- Legend update at `Lobby.tsx:316-352`: insert `{canExport && <Text color="yellow">[x] Export</Text>}` in each branch where rendered (host w/ terminal round, host idle if `canExport`, non-host if `canExport`). Omit when `!canExport` (AC4 — absence is the chosen behavior).

### C3 — `test(cli): cover export keybind paths`

- `Lobby.test.ts`: render with `canExport=true`, assert `[x] Export` in legend; press `x` → `onExportResults` called once. Press `x` with `canExport=false` → not called and legend omits.
- New `packages/cli/src/ui/export.test.ts` (or extend existing): mock `clipboardy.write`, drive `handleExportResults` via a small extracted helper or test through `App` render — match house style of `share.test.ts`. Cover success notice + failure notice.
- Snapshot/inline-string equality: feed a fixed 2-round projection, assert `clipboard.write` receives identical Markdown to `roundsToMarkdown` direct call (AC3 — byte-for-byte parity with mobile).

### C4 (optional) — `docs(cli): note export keybind in package readme`

Only if `packages/cli/README.md` enumerates keybinds. Skip otherwise.

## Verify (pre-push)

```
pnpm --filter @xauyxau/hnch typecheck
pnpm --filter @xauyxau/hnch test
pnpm --filter @xauyxau/hnch build
pnpm --filter @hnch/shared test    # smoke — no changes expected
```

## PR

- Title: `feat(cli): export session results as Markdown to clipboard`
- Scope `cli` only (no shared change → single scope). Closes #115. Touches #88 parity item.
- Body: list AC1-AC8 with checkmarks; note ADR-0013 action item resolved for CLI surface.

## Acceptance trace

| AC | Lands in |
|---|---|
| 1 legend `[x] Export` after reveal | C2 |
| 2 press → `roundsToMarkdown` + clipboard + toast | C1 + C2 |
| 3 byte parity w/ mobile output | C3 |
| 4 no rounds → keybind absent | C2 (`canExport` gate) |
| 5 clipboard fail → clear error | C1 (catch branch) |
| 6 mobile unchanged | not touched |
| 7 no keybind conflict | verified above (`x` unused) |
| 8 two-client incl. departed names | C1 (raw participants record per ADR-0036) |

## Out of scope

File export, `hnch export` subcommand, single-round export, CSV/HTML, format changes — all explicit in issue.
