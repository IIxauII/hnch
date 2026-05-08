# ADR-0015: v1 scope — session-level reveal mode and timer duration

**Status:** Superseded by ADR-0018
**Date:** 2026-04-21

## Context

- ADR-0013 round shape carried per-round `revealMode` and `timerDurationMs?`, with session-level defaults inherited.
- `revealMode` union included `'manual' | 'timer' | 'unanimous'`.
- v1 scope narrowed: reveal triggered by host (manual) or timer expiry only — `'unanimous'` rejected (slow-voter pressure, last-second change-of-mind surprise). Timer duration session-level only — no real planning-poker motivation for per-round overrides.
- Schema today carries fields v1 UI never populates/reads. Choice: keep flexibility vs narrow now.

## Decision

Narrow schema to match v1 UI: (1) reveal modes `'manual' | 'timer'`, drop `'unanimous'`. (2) `revealMode` lives on `settings` only (rename `defaultRevealMode` → `revealMode`); no per-round field. (3) `timerDurationMs` lives on `settings` only (rename `defaultTimerDurationMs` → `timerDurationMs`); no per-round field. (4) Rounds keep only genuinely per-round state: `id, title?, description?, ticketId?, parentRoundId?, scale, timerStartedAt?, revealedAt?, createdBy, createdAt, votes`. ADR-0011's host-as-timer-authority unchanged — only field location moves. ADR-0013's flat-rounds + vote-change rules unchanged.

## Trade-offs

- Re-introducing per-round overrides or unanimous later requires new ADR + additive schema amendment.
- Cannot tell "what reveal mode was this round?" from round record alone — readers check `settings.revealMode`. No v1 analytics/export depends on this.

## Consequences

- Easier: `schema.md` matches implementation; reveal-mode logic = single read from `settings`; one CRDT write per round start; `'unanimous'` observer code gone.
- Harder: future schema amendment for per-round overrides or new reveal modes (bounded cost — additive).
- Revisit when: users request per-story timer durations; users request auto-reveal-when-all-voted; analytics needs per-round reveal-mode history.
