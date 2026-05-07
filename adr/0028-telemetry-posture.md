# ADR-0028: Telemetry / analytics posture — none in v1

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Architecture built on privacy commitments across multiple ADRs: no accounts ([ADR-0005](0005-device-identity-capacitor-device-plugin.md), [ADR-0006](0006-ephemeral-sessions.md)); no fingerprinting ([ADR-0005](0005-device-identity-capacitor-device-plugin.md)); content-blind relay ([ADR-0001](0001-networking-crdt-over-relay.md)); in-memory 24 h snapshots ([ADR-0012](0012-snapshot-policy.md)); opaque access tokens ([ADR-0009](0009-access-control-relay-tokens.md), [ADR-0017](0017-password-hashing-drop-invite-only.md)); short-lived room codes ([ADR-0008](0008-room-code-format.md)).
- Whether client/relay sends usage analytics, crash reports, perf metrics, or any operator-side telemetry is not yet pinned.
- Frameworks would opt us in if untouched (Sentry, Firebase Analytics, Datadog RUM plugins available).
- Current state is "nothing", but result of nobody adding it — not a recorded decision. Future contributor should find this ADR rather than infer from absence.

## Decision

No analytics, telemetry, or crash reporting in v1. Client does not send usage events, crash reports, or perf beacons. Relay does not log per-connection metadata to any sink beyond ephemeral stdout, does not export Prometheus/OTel. CLI does not phone home. Local diagnostics (console logs, in-app error UI, `console.error` for user copy-paste, version string in Settings) remain free. No third-party SDK whose default config sends data to operator-controlled endpoints. Relay stdout discipline: no message bodies / room codes / password hashes / peer IDs at INFO; opaque connection ID OK at INFO; identifiers permitted at WARN/ERROR for actionable debug.

## Options

- **A — No telemetry (chosen):** Pros: zero data egress, zero consent UI, zero supply-chain SDK risk, aligns with rest of architecture. Cons: blind to bug repro on unfamiliar hardware; no usage counts.
- **B — Opt-in anonymized analytics:** Pros: visibility for opted-in users; jurisdiction-friendly. Cons: low opt-in rate skews data; substantial impl cost (consent UI + SDK + endpoint); creates "just one more field" pressure.
- **C — Opt-out anonymized analytics:** Pros: best operator visibility. Cons: collection-by-default contradicts ADR-0001/0005/0006/0009 posture; weakest user-trust posture.
- **D — Server-side metrics only (relay `/metrics`):** Pros: aggregate signals without per-user correlation. Cons: extends relay beyond ADR-0001 content-blind sync conduit; metrics scope erodes over time; better as future explicit successor.

## Trade-offs

- Real cost: bugs only reproducing on user hardware rely on user reports; perf regressions invisible until users notice; "how popular" unanswerable without external proxies.
- "No opt-in" is firmest call — opt-in grows scope, demands consent UI, splits cohorts. Cleanest line is absence of channel.
- Out-of-scope (NOT prohibited): operational relay stdout per Decision §5; user-volunteered bug reports; 24 h snapshot per [ADR-0012](0012-snapshot-policy.md); sync protocol traffic per [ADR-0003](0003-state-sync-yjs.md).

## Consequences

- Easier: no consent flow, no GDPR/CCPA posture maintenance, no third-party DPA, small dependency tree, code-review heuristic emerges (outbound HTTP to non-relay = presumptive reject).
- Harder: total operator-side blindness; rely on real-device pre-release testing; user-submitted bug reports are primary signal.
- Revisit when: specific product question telemetry would answer better than user research (write successor ADR with question + min data + retention + disclosure); real crash users can't repro; relay operational issues stdout can't cover (Option D successor); regulatory/commercial pressure.

## Action Items

- [ ] Add CI/pre-commit grep flagging deps named `analytics|telemetry|sentry|bugsnag|datadog|mixpanel|posthog|amplitude|firebase-analytics`. Tripwire, not gate — false positives acceptable.
- [ ] Verify CLI does not auto-version-check / contact external endpoint.
- [ ] Verify relay stdout does not include peer IDs / room codes / message bodies at INFO.
- [ ] Add short Privacy section to `project.md` for non-developers; cross-link to this ADR.
