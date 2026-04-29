# ADR-0028: Telemetry / analytics posture — none in v1

**Status:** Accepted
**Date:** 2026-04-26
**Deciders:** Xau

## Context

hnch is approaching v1. The architecture has been built around a small set of privacy commitments that show up across multiple ADRs: no accounts ([ADR-0005](0005-device-identity-capacitor-device-plugin.md), [ADR-0006](0006-ephemeral-sessions.md)), no fingerprinting ([ADR-0005](0005-device-identity-capacitor-device-plugin.md) Option C explicitly rejected), a content-blind relay that does not see what teams are voting on ([ADR-0001](0001-networking-crdt-over-relay.md)), in-memory-only relay state with a 24h TTL ([ADR-0012](0012-snapshot-policy.md)), and access-control tokens that are opaque to the relay ([ADR-0009](0009-access-control-relay-tokens.md), [ADR-0017](0017-password-hashing-drop-invite-only.md)). Per-room codes are minted from a pool that retires used codes ([ADR-0008](0008-room-code-format.md)) so even the room-code identifier is short-lived.

What is *not* yet pinned anywhere is whether the client or the relay sends usage analytics, crash reports, performance metrics, or any other form of operator-side telemetry. The defaults from frameworks and SDKs in our stack would, if left untouched, opt us in to several of these channels:

- **Capacitor / Ionic:** no built-in analytics, but third-party plugins exist (`@capacitor-community/firebase-analytics`, Sentry, Datadog, etc.) that an unaware contributor could add to "see if anyone is using the app".
- **Angular:** no built-in analytics; routing is purely client-side.
- **`y-websocket` / Yjs:** the relay sees binary CRDT updates and presence frames; it does not see content, but it could in principle log connection counts, room codes, IP addresses, and connection durations. None of this is logged today beyond what stdout shows for development.
- **Browser-native APIs:** `PerformanceObserver`, `navigator.sendBeacon`, etc. — available but not used.

In every case, the *current* state is "no telemetry", but the current state is the result of nobody having added it, not a recorded decision. A new contributor reviewing this codebase six months from now should not have to read the absence and infer the policy. They should find this ADR.

The decision is also relevant to the user-trust posture stated in `project.md` and reinforced in [ADR-0005](0005-device-identity-capacitor-device-plugin.md) ("makes users who notice it uncomfortable" — about fingerprinting, but the principle generalizes). A privacy-respecting product that quietly ships analytics in its production build is a contradiction users notice and remember.

A reasonable contributor could have argued for the opposite default — minimal anonymized usage telemetry, opt-in crash reporting, server-side connection-count metrics — on the grounds that operating a service blind makes it impossible to find bugs or know whether anyone uses it. Each of those is a real cost, and this ADR records them as the cost we accept.

## Decision

1. **No analytics, no telemetry, no crash reporting in v1.** Specifically:
   - The client does NOT send usage events to any analytics service (Google Analytics, Plausible, Posthog, Mixpanel, Amplitude, etc.).
   - The client does NOT send crash reports to any error-collection service (Sentry, Bugsnag, Datadog RUM, etc.).
   - The client does NOT collect performance metrics (Core Web Vitals beacons, custom timing reports) for transmission anywhere.
   - The relay does NOT log per-connection metadata (IPs, room codes, durations, message counts) to any sink beyond ephemeral stdout for live debugging during development.
   - The relay does NOT export Prometheus-style metrics, OpenTelemetry traces, or structured logs to an aggregator.
   - The CLI ([ADR-0021](0021-cli-package.md)) does NOT phone home for version checks, usage pings, or crash reports.

2. **What "no telemetry" rules out is data egress, not local diagnostics.** The client and relay are free to:
   - Log to the developer console / stderr during development.
   - Store local debugging state in IndexedDB / SQLite / Preferences for the user to inspect ([ADR-0004](0004-local-persistence-sqlite-indexeddb.md) covers persistence).
   - Surface error UI to the user in-app ("connection lost — retrying").
   - Emit `console.error` calls that a user can copy-paste into a bug report.
   - Show a "version" string in Settings so a user reporting a bug can include it.
   What they CANNOT do is automatically send any of that to an operator-controlled endpoint.

3. **No third-party SDKs whose primary purpose is data collection.** A library does not need to be marketed as "analytics" to function as it. The criterion is **outbound data flow**: any dependency that, in its default configuration, sends data to a server outside the user's control is forbidden in v1. Examples that would be rejected: Sentry's default DSN, Firebase Analytics auto-collection, Datadog Browser SDK, LogRocket, FullStory, Hotjar. Static-only libraries (i18n, UI components, utility packages) are fine.

4. **Privacy alignment — completing the "we collect nothing" story.** Each prior ADR has chosen a "no" that telemetry would undo:
   - [ADR-0001](0001-networking-crdt-over-relay.md) — relay is content-blind. Telemetry with content-aware fields would un-blind it.
   - [ADR-0005](0005-device-identity-capacitor-device-plugin.md) — no fingerprinting; per-device ID is local. Telemetry that correlates `Device.getId()` with usage events reintroduces identity correlation by the back door.
   - [ADR-0006](0006-ephemeral-sessions.md) — sessions are ephemeral. Persisted analytics events that outlive the session are a parallel persistent state.
   - [ADR-0007](0007-teams-local-only.md) — Teams are local-only, never synced. Telemetry that records team membership server-side breaks that locality.
   No single one of those ADRs *forbids* telemetry on its own, but together they form a posture that telemetry would silently contradict. This ADR makes the implicit consistent decision explicit and binding.

5. **The relay's ephemeral logs are not a hidden telemetry channel.** Today the relay logs to stdout/stderr on the host machine for development. In a deployed environment that stdout will be captured by whatever process supervisor runs the binary (systemd journal, container log driver, etc.). That capture IS observable to the operator. Specifically:
   - The relay MUST NOT log message bodies, room codes, password hashes, or peer IDs at INFO level. Connection-open / connection-close events at INFO level MAY include an opaque connection ID for debugging but MUST NOT include client IP or room identifier.
   - WARN/ERROR-level logs MAY include identifiers when needed for actionable debugging, on the grounds that a misbehaving client deserves to be debuggable; but the volume should be low and the operator-side log retention is the operator's concern.
   - Operators running their own deploy who want richer logs can patch this themselves; this ADR is the upstream default.

6. **What this ADR does NOT govern (out-of-scope, governed elsewhere or operationally necessary).** "No telemetry" is a stance about *operator-initiated, automated data egress for product / observability purposes*. It is not a stance against every byte that ever leaves the user's device. The following are explicitly NOT in scope of this ADR's prohibition:
   - **Operational relay logs** — relay stdout/stderr per Decision §5, governed by [ADR-0001](0001-networking-crdt-over-relay.md)'s content-blindness and the discipline rules in §5 above. Necessary for the relay to be debuggable; the rules in §5 keep it narrow.
   - **User-volunteered bug reports** — a user copy-pasting a console error into a GitHub issue is the user choosing to share, not the app phoning home. Out of scope by definition.
   - **The 24-hour relay snapshot** — content-blind in-memory CRDT state required for sync, governed by [ADR-0012](0012-snapshot-policy.md). It is operational state, not analytics, and never read by humans during normal operation.
   - **Sync protocol traffic** — the y-websocket protocol's binary CRDT updates and presence frames per [ADR-0003](0003-state-sync-yjs.md). Required for the product to function; content-blind to the relay.
   These are listed so a future contributor doesn't read this ADR as forbidding things it does not forbid.

7. **No "anonymous usage" exception.** A contributor's argument that "we just want to know how many people use the app, no PII" does not unlock telemetry. Anonymized counters still require an outbound channel, still require a server endpoint, still require a privacy disclosure, and still create a foot-gun for "and could we just add one more field". The cleanest line is the absence of the channel.

8. **Code-enforcement rules.** The prohibition is enforced by:
   - No third-party tracking SDKs in `package.json` for any of `packages/client`, `packages/cli`, `packages/relay` ([ADR-0014](0014-repo-layout-pnpm-workspaces.md) workspace boundaries). The dependency-name heuristic listed in Action Items below (`analytics`, `telemetry`, `sentry`, `bugsnag`, `datadog`, `mixpanel`, `posthog`, `amplitude`, `firebase-analytics`) is a starting set, not exhaustive — code review remains the ultimate guard.
   - No `fetch` / `XMLHttpRequest` / `navigator.sendBeacon` / WebSocket connections from client code to any host other than the configured relay origin. Code review flags any new outbound endpoint as presumptively rejected pending a successor ADR.
   - The CI heuristic is a tripwire, not a gate — false positives are acceptable; the goal is forcing the conversation, not auto-blocking PRs.

9. **This is a v1 decision, not a permanent commitment.** Post-launch, if a real product question arises that telemetry would answer (e.g., "is the unanimous-reveal flow ever actually triggering?", "how often does the room-full path fire?"), the team revisits via a successor ADR with: an explicit threat model, a description of what is collected, a description of what is NOT collected, an opt-in or opt-out posture, the data-retention policy, and a privacy disclosure update. Until that ADR exists, the answer is "no telemetry".

## Options Considered

### Option A: No telemetry, no analytics, no crash reporting (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Operator visibility | None — fly blind |
| User-trust posture | Strongest |
| Bug-fix iteration speed | Slowest (rely on user reports) |
| Privacy disclosure burden | Minimal |

**Pros:** zero data egress means zero "did we configure the consent string correctly" risk, zero "we don't actually need that field" follow-up scope, zero third-party SDK supply-chain surface, and a clean alignment with the privacy posture every other ADR has already chosen. The product is small enough at v1 that user reports + reproducible local repros are a viable bug-fix loop.
**Cons:** we genuinely cannot answer "how many people use this, in what configuration, hitting which paths". Crashes that happen on a real user's device but never on a developer's are invisible until someone reports them. This is a real cost, not a notional one — it is the price of the posture.

### Option B: Opt-in anonymized analytics

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Operator visibility | Partial — only opted-in users |
| User-trust posture | Acceptable if disclosed honestly |
| Bug-fix iteration speed | Faster for opted-in users' issues |
| Privacy disclosure burden | Substantial — consent flows, disclosure copy, settings toggle |

**Pros:** offers the operator some visibility while respecting users who decline. Consistent with privacy norms in jurisdictions that require explicit consent.
**Cons:** the opt-in rate would be low (a poker app's audience self-selects toward "I just want to point-poker, not read a consent flow"), making the data unrepresentative. The implementation cost — consent UI, settings toggle, disclosure copy, the analytics SDK itself, the back-end endpoint — is substantial relative to the signal value. Worse, once the channel exists, the temptation to "just add one more field" is real, and the next contributor adds it without re-running the disclosure flow.

### Option C: Opt-out anonymized analytics

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Operator visibility | Highest among the three |
| User-trust posture | Weakest — collection-by-default contradicts the rest of the project |
| Bug-fix iteration speed | Fastest |
| Privacy disclosure burden | Highest — consent flows, GDPR posture, etc. |

**Pros:** the operator sees nearly everyone's data; bug-fix loop is quick.
**Cons:** opt-out collection is the posture this project has spent five ADRs explicitly *not* taking. ADR-0005 rejected fingerprinting; ADR-0001 made the relay content-blind; ADR-0006 made sessions ephemeral; ADR-0009 made access tokens opaque. Switching to opt-out telemetry at the edge would contradict the rest of the architecture and would surprise users who form their privacy expectation from what the product looks like everywhere else.

### Option D: Server-side metrics only (relay observability)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-medium |
| Operator visibility | Limited to relay-observable signals |
| User-trust posture | Acceptable — no per-user identity correlation |
| Bug-fix iteration speed | Modest — only relay-side bugs visible |
| Privacy disclosure burden | Low |

**Pros:** the relay's connection counts, message rates, room creation rates, and WS close-code distribution are operator-side signals that don't require correlating with any per-user identity. They live in the relay process anyway and could be exported via a `/metrics` endpoint.
**Cons:** the moment the relay starts exporting metrics is the moment the relay grows a second function beyond ADR-0001's "content-blind sync conduit". Even purely operational metrics (connection count, room count) are surveillance-adjacent if retained, and the discipline to keep the metrics narrow erodes over time. Better posture: the relay's stdout/stderr (per Decision §5) is what the operator gets; richer metrics require a successor ADR.

## Trade-off Analysis

The privacy posture across [ADR-0001](0001-networking-crdt-over-relay.md), [ADR-0005](0005-device-identity-capacitor-device-plugin.md), [ADR-0006](0006-ephemeral-sessions.md), [ADR-0009](0009-access-control-relay-tokens.md), and [ADR-0012](0012-snapshot-policy.md) makes Option A the only choice that doesn't quietly contradict the rest of the architecture. The product's value proposition is "point-poker that doesn't watch you" — analytics that watch you, even anonymized, would erode that. The cost is real (we are blind to bugs that don't reproduce on developer hardware; we cannot count users) and the ADR records that cost honestly rather than pretending it's free.

Option D is the version we'd consider first if the operator-side blindness becomes painful, because relay-side aggregate metrics don't require per-user correlation. The reason it's not the v1 default is that "we'll add /metrics now and never expand it" is precisely the kind of optimism that bug-by-bug erodes the architecture's privacy posture. Better to ship with nothing, feel the cost, and make a deliberate choice about what to add when the cost outweighs the principle.

The "no opt-in either" stance (ruling out Option B) is the firmest call in this ADR. Opt-in analytics look harmless on paper. In practice they grow scope, demand consent UI, and split the user base into "tracked" and "untracked" cohorts whose behavior may differ. The cleanest line is the absence of the channel. The team retains the option to revisit.

## Consequences

**Easier:**
- No consent flow, no disclosure copy, no analytics SDK to vet for supply-chain risk, no GDPR/CCPA posture statement to maintain, no third-party data-processing agreement.
- The privacy story is short and matches what the architecture actually does. Users who care can verify it from network-tab inspection.
- The dependency tree stays small — every direct dependency we ship has a non-telemetry purpose.
- A code-review heuristic emerges: PRs adding outbound HTTP calls to non-relay endpoints are presumptively rejected pending a successor ADR.

**Harder:**
- Operator-side blindness is total. We cannot say "X% of users hit the room-full path" without instrumenting it ourselves on a future fork or asking users directly.
- Bugs that only reproduce on real users' devices and configurations rely entirely on user-submitted reports, which means the bug-report path needs to be obvious in-app (existing settings/help screen handles this).
- Performance regressions invisible to developer-machine testing will go uncaught until users notice. Mitigation: test on real low-end devices in CI / pre-release; regression budgets enforced via local Lighthouse runs.
- "How popular is the app" is unanswerable without a separate survey or external proxy (download counts on app stores, post-launch).

**Revisit triggers:**
- A specific product question (not a vague desire) that telemetry would answer better than user research. Trigger: write a successor ADR with the question, the minimum data that answers it, the retention policy, the disclosure copy, and the opt-in/opt-out posture.
- A real crash that user reports cannot reproduce, costing the team meaningful debugging cycles. Trigger: consider opt-in crash reporting (Sentry-like) with a threat model that addresses what gets sent (stack traces, OS/version, NOT URL/code/peer identifiers).
- Relay operational issues (connection storms, abuse) where stdout logs are insufficient. Trigger: consider Option D's narrow `/metrics` endpoint with an explicit successor ADR pinning what's collected and what isn't.
- Regulatory or commercial pressure (e.g., enterprise customer demands a SOC 2 audit trail). Trigger: explicit successor ADR; do not add telemetry as a side-effect of a contract.

## Action Items

- [ ] Once accepted, update [`adr/README.md`](README.md) index with this entry as ADR-0028.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the no-telemetry posture.
- [ ] Cross-link from [ADR-0005](0005-device-identity-capacitor-device-plugin.md) (typo-class addition) noting that the per-device identifier MUST NOT be transmitted off-device for any non-protocol purpose, per this ADR.
- [ ] Cross-link from [ADR-0001](0001-networking-crdt-over-relay.md) (typo-class addition) noting that the relay's content-blindness is reinforced by this ADR's "no operator-side observability" stance.
- [ ] Cross-link from [ADR-0006](0006-ephemeral-sessions.md) (typo-class addition) noting that session ephemerality would be undermined by persisted analytics events, per this ADR.
- [ ] Cross-link from [ADR-0007](0007-teams-local-only.md) (typo-class addition) noting that Teams' local-only locality would be broken by server-side telemetry recording team membership, per this ADR.
- [ ] Add a short "Privacy" section to [`project.md`](../project.md) summarizing the no-telemetry stance for non-developer readers; cross-link to this ADR for the formal statement.
- [ ] Add a CI / pre-commit grep check that flags new dependencies likely to perform outbound data collection (rough heuristic: package names containing `analytics`, `telemetry`, `sentry`, `bugsnag`, `datadog`, `mixpanel`, `posthog`, `amplitude`, `firebase-analytics`). False positives are acceptable; the goal is forcing a code-review conversation.
- [ ] Verify the CLI does not perform an automatic version-check or update-check that contacts an external endpoint. If absent, document. If present, file as a regression to remove or convert to manual-only.
- [ ] Verify the relay's current stdout logging does not accidentally include peer IDs, room codes, or message bodies at INFO level. If it does, file as a follow-up to scrub.
