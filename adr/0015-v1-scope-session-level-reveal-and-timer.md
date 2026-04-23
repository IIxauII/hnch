# ADR-0015: v1 scope — session-level reveal mode and timer duration

**Status:** Superseded by ADR-0018
**Date:** 2026-04-21
**Deciders:** Xau

## Context

Two earlier decisions left the door open to per-round flexibility that v1 does not actually use:

1. **ADR-0013** (flat round model) listed each round's action-item schema as carrying its own `revealMode` and `timerDurationMs?`, with session-level `defaultRevealMode` and `defaultTimerDurationMs?` acting as inherited defaults on new rounds.
2. The `revealMode` union in `schema.md` included three values — `'manual'`, `'timer'`, and `'unanimous'` (auto-reveal once every connected participant has voted).

While drafting [`ux.md`](../ux.md) we made two product decisions that narrow this scope:

- **Reveal is triggered by the host (manual) or by timer expiry only.** We deliberately rejected a "reveal when everyone has voted" auto-detection because it creates pressure on slow voters and surprises participants who change their minds at the last second. A human-initiated reveal is the planning-poker convention, and the existing timer path covers the "don't wait forever" case.
- **Timer duration is a session-level setting, not per-round.** Hosts configure the timer once in the Session Settings sheet and every round uses that value. We considered per-round overrides but could not find a real planning-poker motivation for them — timers are a pacing tool for the session, not a property of individual stories.

The schema as written today has fields and a union variant the v1 UI will never populate or read. We have two plausible paths:

- **Keep the flexibility** and let the v1 UI simply ignore the extra fields, carrying them as a reservation for future features.
- **Narrow the schema now** so the shape exactly matches what v1 writes and reads.

This ADR records the choice and its rationale, and specifies the concrete schema shape so `schema.md` can follow.

## Decision

**Narrow the schema to match the v1 UI.** Specifically:

1. **Reveal modes are `'manual' | 'timer'`.** The `'unanimous'` variant is removed.
2. **`revealMode` lives on `settings` only.** There is no per-round `revealMode` field. Rename `settings.defaultRevealMode` to `settings.revealMode`.
3. **`timerDurationMs` lives on `settings` only.** There is no per-round `timerDurationMs` field. Rename `settings.defaultTimerDurationMs` to `settings.timerDurationMs`.
4. **Rounds retain only per-round state that is genuinely per-round:** `id`, `title?`, `description?`, `ticketId?`, `parentRoundId?`, `scale` (snapshotted at round creation — still per-round so that changing the session default does not rewrite history, and for compatibility with [ADR-0013](0013-round-model-flat-parentroundid.md)'s inline-scale rationale), `timerStartedAt?`, `revealedAt?`, `createdBy`, `createdAt`, `votes`.

**Interaction with [ADR-0011](0011-timer-authority.md):** ADR-0011's core decision — that the host writes `timerStartedAt = Date.now()` at round start and that the host's client authoritatively triggers reveal on expiry — is unchanged. What changes is the field location: `timerDurationMs` is read from `settings.timerDurationMs` (set ahead of time by the host via the Session Settings sheet) rather than being written into the round record at round start. The expiry calculation `remaining = settings.timerDurationMs - (Date.now() - round.timerStartedAt)` and the fallback-reveal rule from ADR-0011's Consequences section continue to apply exactly as before. This ADR clarifies the field location; it does not supersede ADR-0011.

**Interaction with [ADR-0013](0013-round-model-flat-parentroundid.md):** ADR-0013's first action item lists a round-record shape that includes `revealMode` and `timerDurationMs?`. That list is now out of date; the authoritative round shape is the one in `schema.md` as updated to match this ADR. ADR-0013's body — its decision about flat rounds with `parentRoundId`, its vote-change-before-reveal rule — is unchanged.

## Options Considered

### Option A: Narrow the schema to match v1 (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — the v1 shape is what we implement |
| Forward-compatibility | Requires a future ADR if we want per-round overrides or unanimous reveal |
| Clarity | High — schema matches the UI exactly |
| Team familiarity | Standard |

**Pros:** the schema is the contract the implementation actually uses. No "reserved for future" fields to wonder about. Fewer CRDT writes at round start (only `timerStartedAt`). Removes the client-side "everyone voted" observer that `'unanimous'` required. Smaller surface for bugs and migration complexity.
**Cons:** a future decision to add per-round timers or unanimous reveal needs a new ADR plus a schema change. That schema change is additive (new optional fields) so it is backward-compatible for readers — but writers on older clients won't produce the new field, which we'd handle with defaults as usual.

### Option B: Keep the schema flexible; v1 UI uses only the session-level subset

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — more fields than the UI touches |
| Forward-compatibility | High — per-round overrides and unanimous are already there |
| Clarity | Low — contract is wider than the implementation |
| Team familiarity | Standard |

**Pros:** enabling per-round timers or unanimous reveal later is a UI-only change. No schema migration. Round records carry an explicit `revealMode`/`timerDurationMs` that documents what the round "was" even if the session default changed later — small retrospective-value benefit.
**Cons:** the schema describes capabilities the implementation does not exercise — dead state in the doc. "Why is this field here?" becomes a frequent question. Every code path that reads a round has to decide whether to prefer the round override or the session default, which is easy to get wrong (inconsistent behavior, subtle bugs). Paying ongoing complexity tax for a feature we don't have a concrete plan to ship.

### Option C: Keep per-round fields but drop `'unanimous'`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Forward-compatibility | Medium — per-round override kept, unanimous is gone |
| Clarity | Middle |
| Team familiarity | Standard |

**Pros:** preserves the "per-round override" flexibility that has some theoretical planning-poker value (e.g., "this story is complex, give it 5 minutes; the next one is trivial, 60 seconds"), while dropping the reveal mode we actively rejected.
**Cons:** same "dead state in the doc" concern as Option B, just smaller. Still pays the session-vs-round resolution tax on every read. The theoretical per-round-timer use case is not one we've heard from users.

## Trade-off Analysis

Option A trades future convenience for current clarity — and the future we are trading against is speculative. If we discover a real need for per-round timers or a team genuinely asking for unanimous reveal, re-introducing those fields is a modest, additive schema change documented by a new ADR. That is exactly the mechanism our ADR process exists for. Paying ongoing complexity for features we have no concrete design or user signal for is the worse deal.

The one honest loss: Option A removes the ability to tell "what reveal mode was this round run under?" from the round record alone — readers have to check `settings.revealMode`, and if settings changed mid-session, they'd need to know when. For v1 we don't have any analytics or export feature that cares. If we add one, a retrospectively-added `revealMode` field on rounds can be populated going forward.

## Consequences

**Easier:**
- `schema.md` describes exactly the shape the implementation writes and reads.
- Reveal-mode logic is a single read from `settings.revealMode`; no precedence rules.
- Timer logic reads duration from `settings.timerDurationMs` and the per-round `timerStartedAt`; host's work at round start is a single CRDT write.
- The `'unanimous'` observer and its associated derived-state code path go away.

**Harder:**
- Adding per-round overrides or an additional reveal mode later requires an ADR and a schema amendment. That ADR will be small and the amendment is additive, so the cost is real but bounded.

**Revisit triggers:**
- Users explicitly asking for per-story timer durations (e.g., "5 minutes for this one, 1 minute for the next").
- Users explicitly asking for auto-reveal when everyone has voted.
- A retrospective or analytics feature that needs per-round reveal-mode history.

## Action Items

- [ ] Update `schema.md` to reflect the narrower settings shape (`revealMode`, `timerDurationMs`) and drop the per-round `revealMode` / `timerDurationMs` fields and the `'unanimous'` union member. Remove the `'unanimous'` derived-state note.
- [ ] Minor-correct [ADR-0011](0011-timer-authority.md)'s Context line referring to "configurable per round" — clarification, not a decision change.
- [ ] Update `adr/README.md` index and `CLAUDE.md`'s "Current decisions at a glance" to reference this ADR.
- [ ] When implementation begins, wire host-side timer-expiry to read `settings.timerDurationMs` and `round.timerStartedAt` as specified above.
