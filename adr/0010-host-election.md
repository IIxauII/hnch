# ADR-0010: Host election mechanics

**Status:** Accepted
**Date:** 2026-04-21

## Context

- ADR-0001 relay has no concept of "host," but several ops need one authoritative actor: manual reveal, auto-reveal broadcast (ADR-0011), invite admission (ADR-0009).
- Host migration required — if host drops, session continues without manual intervention.
- Election must be deterministic under churn yet stable enough that brief disconnects don't flap the role.

## Decision

1. Session creator = initial host, recorded as `hostPeerId` in Yjs doc on creation.
2. On host disconnect, clients wait **5s debounce** (most disconnects are transient blips).
3. Still absent → each client independently picks **lexicographically-lowest device ID among connected peers**. Same awareness state + same fn → same answer, no coordination.
4. New host writes itself to `hostPeerId` (concurrent writes Yjs-merge to same value).
5. Original host reconnecting **does not reclaim** — current `hostPeerId` respected.

Peer ID = device identifier from ADR-0005. UI shows current host with crown icon.

## Options

- **A — Creator + lowest-ID-on-drop with debounce (chosen):** respects creator intent; deterministic without consensus protocol; debounce handles blips; no-reclaim keeps state simple. Cons: lex device ID is arbitrary ordering.
- **B — Earliest-joined-among-connected:** "senior peer" intuitive. Cons: needs stable join timestamps via awareness (manipulable); flaps when senior peer steps away; ignores creator intent.
- **C — Explicit handoff + automatic fallback:** intentional baton-pass useful for facilitator handoff. Cons: extra UI scope creep for v1; auto-on-drop alone covers known scenarios.
- **D — No host, all consensual:** elegant pure-CRDT. Cons: timer expiry/reveal/admission need single actor; races otherwise incoherent.

## Trade-offs

- 5s debounce window where no host exists → manual-reveal disabled, auto-reveal paused.
- Doc is writable by any peer → malicious client could fake `hostPeerId`. Consistent with v1 vote-integrity posture.

## Consequences

- Easier: clear owner for reveal/admission/timer; convergence without consensus; blips don't disrupt flow.
- Harder: edge case host-drops-at-timer-expiry needs explicit handling.
- Revisit when: users want explicit handoff → add Option C; vote-signing/device-key work → signed host claims.

## Action Items

- [ ] Awareness-based connected-peer view used for election.
- [ ] 5s debounce + election as client-side state machine.
- [ ] Crown UI on participant list.
- [ ] Test host-drops-during-timer-countdown — new host inherits via `timerStartedAt` (ADR-0011).
