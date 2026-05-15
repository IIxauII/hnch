# Issue #109 — Expose ticket ID in round-start modal

Tracks: https://github.com/IIxauII/hnch/issues/109

## Strategy

- Start from fresh `main`. Two worktrees, two PRs (client → CLI). CLI PR rebases on merged client PR.
- Atomic commits within each PR — one logical change per commit, all green.
- Schema unchanged (`ticketId?` already in `packages/shared/src/doc.ts:128`).

## Decisions

| | |
|---|---|
| PR split | 2 PRs: client first, CLI second |
| Retro-edit (`updateRoundDescriptor`) | Deferred per issue out-of-scope |
| Round-export inclusion | Now (PR-1) |
| Tests | Unit + 1 E2E |

## PR-1: client + shared (worktree `ticket-id-client`)

Branch: `ticket-id-client` off `main`.

Commits:
1. `chore(shared): confirm ticketId schema parity` — verify `doc.ts` ↔ `schema.md`; round-trip unit test.
2. `feat(shared): include ticketId in round-export` — extend `round-export.ts` + tests (id-only, id+title, neither).
3. `feat(client): add ticket ID input to round-start modal` — optional `ion-input`; trim+drop-empty guard; pass to `DocService.startRound`; re-vote inheritance.
4. `feat(client): display ticketId in lobby results + history` — `formatRoundLabel(round)` helper; results heading + history rows.
5. `test(client): unit + e2e for ticket ID flow` — unit (helper, guard, inheritance); E2E (two-client sync covering AC #2/#3/#4/#8).
6. `chore: changelog` — client + shared CHANGELOG.

Verify gate before PR open:
```
pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm e2e
```

## PR-2: CLI (worktree `ticket-id-cli`, after PR-1 merge)

Commits:
1. `feat(cli): prompt for optional ticket ID at round start` — Enter to skip; same trim/empty guard.
2. `feat(cli): render ticketId in CLI lobby views` — reuse helper (lift to shared if duplicated).
3. `test(cli): unit coverage for ticket ID prompt + render`.
4. `chore: changelog`.

## AC mapping

| AC | Where covered |
|---|---|
| 1 modal field optional, Start enabled | PR-1 C3 |
| 2 startRound writes ticketId | PR-1 C3 + E2E |
| 3 results heading format | PR-1 C4 + unit |
| 4 history row format | PR-1 C4 + unit |
| 5 re-vote pre-fill | PR-1 C3 + unit |
| 6 blank → unset | PR-1 C3 + unit |
| 7 CLI prompt | PR-2 C1 + unit |
| 8 cross-client sync | PR-1 C5 E2E |

## Risks

- Re-vote inheritance location TBD — locate in `doc.service.ts` / lobby before C3.
- Lobby helper duplication CLI ↔ web — lift to `packages/shared` if real.
- E2E flake on Yjs sync timing — use existing wait helpers.
