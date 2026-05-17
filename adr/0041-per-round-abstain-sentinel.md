# ADR-0041: Per-round abstain action for voters

**Status:** Accepted
**Date:** 2026-05-16

## Context

- Issue #120: voters need a way to abstain from a single round without falsely voting or joining a "didn't vote" bucket post-reveal.
- Current model (ADR-0013, ADR-0020): `round.votes` is `Y.Map<participantId, string>` where values are card IDs. Participant roles (voter/viewer) are session-level. No per-round abstain mechanism.
- Unanimous auto-reveal (ADR-0018): "all online voters have voted" check fires when every online voter has a key in `round.votes`. Abstainers must be indistinguishable pre-reveal to avoid social pressure to revoke; post-reveal, must parse separately from "didn't vote."
- Re-vote semantics (ADR-0013): new child rounds are fresh slates. Abstention must not inherit to child rounds.
- Scale integrity (ADR-0019): builtin presets + device-local customization. Custom scales must reject abstain string as a card label.

## Decision

(1) **Sentinel value:** string literal `hnch_abstain` written to `round.votes[participantId]` when voter taps Abstain. Exported as `ABSTAIN_SENTINEL` constant + `isAbstainVote(card: string): boolean` type guard from `@hnch/shared`.

(2) **Auto-reveal denominator amendment:** unanimous auto-reveal fires when all remaining online *non-abstain* voters have a numeric vote in `round.votes`. Abstain entries *present* in map but excluded from "must have voted" check. Semantically: abstainers behave like ADR-0020 viewers for the duration of that round.

(3) **"Didn't vote" group:** post-reveal, "Didn't vote" = online voters with no entry in `round.votes`. "Abstained" = entries equal to `ABSTAIN_SENTINEL`. Mutually exclusive groups in results UI + exports.

(4) **Re-vote:** pure fresh slate. Abstention does not inherit into child rounds (ADR-0013 re-vote semantics unchanged). No UX hint on child round that parent was abstained.

(5) **Estimating UI (client):** full-width muted "Abstain this round" button below card grid for participants with `role: voter`. On tap, writes sentinel immediately (no confirmation). Card grid dims to ~40% opacity, no card selected, abstain button shows active/filled state. Tapping any card clears abstention and casts that vote.

(6) **Avatar row:** abstainers appear filled (voted) pre-reveal, indistinguishable from other voters. Preserves anonymity of choice; prevents social pressure to revoke.

(7) **CLI:** `[a]` keybind on Voting screen mirrors client behavior. Results table shows abstained participants in distinct row.

(8) **Relay:** no changes. Content-blind; sentinel is opaque to relay.

(9) **CustomScale validator:** rejects `hnch_abstain` exact string as a card label (belt-and-suspenders guard alongside constant export).

(10) **Out of scope:** free-text abstain reason; host-initiated abstain on behalf of another participant; retroactive clearing post-reveal; modifying session-wide viewer role (ADR-0020 unchanged); abstain per-session preference.

## Trade-offs

- Adds one conditional branch to auto-reveal logic (filter non-abstain before checking all voted).
- CustomScale picker must guard label input against sentinel string.
- Results table gains a third group category (voted/abstained/didn't vote).
- Card grid opacity/state handling adds UI complexity.

## Consequences

- Easier: sentinel is opaque to relay (no sync changes); abstain is opt-in per round; no session-level state inflation; fresh re-votes mean clean slate on re-ask.
- Harder: auto-reveal denominator logic gains conditional; results projection must distinguish three groups; UI must show three distinct outcomes.
- Revisit when: teams request per-session abstain preference (default-abstain toggle, "abstain this and all future rounds") → new ADR with session settings extension; teams request abstain reason/notes → new ADR with optional round field; teams request host-initiated abstain → new ADR with host authority extension.
