# ADR-0030: Canonical product origin is `hnch.dev` (supersedes ADR-0026 origin clause only)

**Status:** Accepted — supersedes the origin clause of [ADR-0026](0026-deep-link-url-format.md) only
**Date:** 2026-04-28
**Deciders:** Xau

## Context

[ADR-0026](0026-deep-link-url-format.md) ("Deep-link URL format") fixed the deep-link / invite URL shape and named the production origin as `https://hnch.app`. At the time that ADR was written, no domain had been registered for the project — `hnch.app` was an aspiration, not a fact. ADR-0026 went so far as to enumerate the origin string in its "public-contract immutability" clause:

> The base origin `https://hnch.app` once production ships.
> *(ADR-0026, Decision §5)*

It also referenced `https://hnch.app/.well-known/apple-app-site-association` as the future AASA payload location for Phase 6b iOS universal links.

Since then, [ADR-0029](0029-relay-deployment.md) ("Relay deployment — bare-metal VPS with Caddy reverse proxy and single-origin layout") committed the actual deployment to a different origin:

> Deploy the relay bare-metal on a single IONOS VPS … Serve the PWA static build and the relay HTTP/WebSocket endpoints from a single origin (`https://hnch.dev`) …
> *(ADR-0029, Decision)*

ADR-0029 records that the user "owns an IONOS VPS … and the domain `hnch.dev` (also IONOS-registered)." The `hnch.app` domain referenced in ADR-0026 is **not** owned by the project, has never been registered, and is not the deployment target. ADR-0029 did not explicitly amend ADR-0026's origin clause — it spoke about deployment infrastructure, not the deep-link contract.

The code has now moved to match reality: `packages/client/src/environments/environment.prod.ts` was changed to set `appBaseUrl` to `https://hnch.dev`. Per the project's ADR rule (CLAUDE.md, "Reversing or meaningfully modifying a previous ADR"), reversing the origin string committed in ADR-0026 requires a new superseding ADR. This ADR is that record.

The scope here is deliberately **narrow**. ADR-0026 made several decisions: the URL path (`/join`), the query-parameter shape (`?code=…`), the normalization rules (liberal accept, exact mint), the auto-fill / auto-submit behavior, the "no password in URL" rule, the AASA path-prefix exclusivity rule, and the CLI's normalization-parity contract. None of those is being changed. Only the origin string — the leading `${appBaseUrl}` portion of the canonical link — is being corrected.

There is also no production release that predates this change. No QR codes have been printed against `hnch.app`, no AASA file has been deployed, no Slack threads have been seeded with `https://hnch.app/join?code=…` invite links from a production build. The "public contract" framing in ADR-0026 anticipated a moment after which the origin would be expensive to change; that moment has not yet occurred. Acting now means there is nothing to migrate.

## Decision

The canonical product origin is **`https://hnch.dev`**. All deep links, QR codes, AASA payloads, printed artifacts, marketing links, and the deployed client and relay endpoints use this origin.

Specifically:
- `appBaseUrl` in `packages/client/src/environments/environment.prod.ts` is `https://hnch.dev`. Development remains `http://localhost:4200` per ADR-0026.
- The Phase 6b AASA payload, when written, lives at `https://hnch.dev/.well-known/apple-app-site-association`.
- All other clauses of ADR-0026 — URL path `/join`, query parameter `code`, normalization rules, no-password-in-URL, public-contract immutability of the *shape*, AASA path-prefix exclusivity, CLI normalization parity — remain in force unchanged. This ADR supersedes ADR-0026 **only** in the origin string.

## Options Considered

### Option A: Adopt `hnch.dev` as the canonical origin (CHOSEN)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — single string change in `environment.prod.ts`, already done |
| Cost | None — domain already owned and paid for |
| Migration burden | None — no production artifacts predate this change |
| Alignment with ADR-0029 | Full — single-origin deployment lives at `hnch.dev` |
| Public-contract risk | Minimal — no QR codes, AASA payloads, or shared invite links exist yet |

**Pros:** matches the deployed reality (ADR-0029) and eliminates a latent inconsistency between two accepted-but-unreconciled ADRs. The deferred AASA / printed-artifact decisions in ADR-0026 (Phase 6b iOS build, posters, etc.) now target a domain that actually exists and is actually served by the relay. Zero migration cost because nothing has yet been published against `hnch.app`.

**Cons:** the project's first ADR-recorded origin string changes. To a strict reading of ADR-0026's "public contract" clause, even pre-production this is a contract reversal — but the contract was about *post-production* immutability ("once production ships"), and production has not shipped.

### Option B: Keep `hnch.app` as canonical, register the domain, redirect to `hnch.dev`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — two domains, two TLS certs, one HTTP-301 redirect, two DNS zones to keep correct |
| Cost | Annual cost of the second domain registration, ongoing |
| Migration burden | Same as A for current artifacts (none) |
| Alignment with ADR-0029 | Partial — deployment still on `hnch.dev`; `hnch.app` would be a redirect-only origin |
| Public-contract risk | Low for now, but adds a permanent operational surface |

**Pros:** preserves the literal origin string committed in ADR-0026 without requiring a superseding ADR. A user who somehow encounters an `hnch.app` link in the future would still land in the app.

**Cons:** spends real money and operational attention on a redirect that no published artifact yet depends on. Adds a second TLS cert and DNS zone for a hostname that has no real role. AASA and Apple universal-link bindings would have to be either declared on both origins (doubling the AASA / assetlinks workload) or only on `hnch.dev` (in which case `hnch.app` would silently fail to deep-link into the iOS app — worse than not owning the domain at all). Solo-operator surface area for no user benefit. The right time to consider this is *if* the `hnch.app` domain becomes acquirable and a multi-domain strategy is explicitly desired (see Revisit triggers).

### Option C: Inline a status note on ADR-0026 instead of writing a new ADR

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one line edit |
| Conformance with ADR convention | **Violates immutability** — ADR-0026 was Proposed but its status header is reserved for `Proposed | Accepted | Deprecated | Superseded by …` per [`adr/README.md`](README.md) |
| Audit trail | Weaker — a status note records *that* a change happened, not *why* or *what was considered* |

**Pros:** zero ceremony.

**Cons:** ADRs are immutable once accepted (per [`adr/README.md`](README.md), "Immutability"); a status-note approach would conflate "the ADR's body says X" with "but actually we do Y" without recording the decision-making. Even though ADR-0026 is currently `Proposed` — meaning a body edit would technically be permitted — using that latitude to walk back a decision rather than write the successor would set a corrosive precedent: every accepted ADR was once a proposed one, and the discipline that protects accepted ADRs comes from treating the status taxonomy seriously regardless of the current state. Project policy (CLAUDE.md, "Reversing or meaningfully modifying a previous ADR requires a new ADR") applies regardless of whether the predecessor is Proposed or Accepted.

## Trade-off Analysis

Option A wins on every axis: it costs nothing, it matches the deployed reality, it requires no migration, and it produces a clean record. The "trade-off" in this ADR is genuinely small — this is a **correction**, not a course change. The cost we pay is producing one more ADR file and editing the status header on ADR-0026; the cost we avoid is permanent two-domain operational surface area (Option B) or a decision-trail dilution (Option C).

What we give up: the literal origin string committed in ADR-0026 is no longer the origin. To a future reader skimming only ADR-0026, the recorded `hnch.app` could be misleading; the supersession header on ADR-0026 plus this ADR's cross-link is the mitigation. To anyone reading the index in `adr/README.md`, the "Superseded by ADR-0030 (origin clause only)" note flags that the supersession is partial — the rest of ADR-0026 is still in force.

## Consequences

**Easier:**
- The deployed origin (ADR-0029) and the deep-link origin (ADR-0026, as amended here) are aligned. A reader cross-referencing the two ADRs no longer hits a contradiction.
- The Phase 6b AASA payload has a real, owned target. The iOS universal-link work can proceed without an "and also we need to acquire `hnch.app` first" precondition.
- QR codes and printed posters generated from a production build will encode a URL that resolves to a real origin.

**Harder:**
- Anyone who reads ADR-0026 in isolation must follow the supersession link to discover the corrected origin. The status-header note ("Superseded by ADR-0030 (origin clause only)") is the breadcrumb; the index in `adr/README.md` is the index.
- The remaining mentions of `hnch.app` in the repo (see Action Items) are now stale and should be flipped opportunistically. Until they are, a contributor grepping for the canonical origin will get stale hits in `roadmap.md` and a JSDoc example.

**Test fixtures:** `packages/shared/src/room-code.test.ts` currently uses `hnch.app` as a parser fixture. This remains *valid* — the parser is origin-blind by design (per ADR-0026's normalization rules, only the `code` query parameter is consumed, not the origin), so the test exercises the parser correctly regardless of the origin string in the fixture URL. Updating the fixture for accuracy is a follow-up nicety, not a correctness fix.

**Already-shipped artifacts:** none. There is no production release predating this change. No QR codes, AASA files, or marketing links exist that point to `hnch.app`. This is the cheapest possible moment to make the correction.

**Revisit conditions:**
- **Acquisition of `hnch.app` becomes desirable.** If the project later acquires `hnch.app` (e.g., to retire confusion in the marketplace, or to serve a marketing landing page distinct from the app domain) and a multi-domain deep-link strategy becomes desirable, this ADR is the place to start the rethink. A successor ADR would need to address: AASA payloads on both origins, normalization across origins, which origin is canonical for *minted* links versus which is *accepted*, and the operational surface (TLS, DNS, redirects).
- **A different canonical hostname is desired** (e.g., `app.hnch.dev` subdomain split, or the project moves to a different TLD entirely) — the same successor-ADR path applies.
- **iOS / Android deep-link semantics change** in a way that constrains origin choice — ADR-0026's revisit triggers already cover this; this ADR's origin change does not alter the calculus.

## Action Items

- [ ] Edit ADR-0026's status header to `Superseded by ADR-0030 (origin clause only)` and update the `adr/README.md` index entry to match. *(Done in the same change as this ADR per project supersession convention.)*
- [ ] Update `adr/README.md` to add a row for ADR-0030. *(Done.)*
- [ ] Update CLAUDE.md "Current decisions at a glance" so the deployment line and any future deep-link line reference `hnch.dev` consistently. (Currently the deployment bullet already says `hnch.dev`; the deep-link contract is not yet enumerated there. If a deep-link bullet is added per ADR-0026's action items, it should name `hnch.dev`.)
- [ ] Flip remaining `hnch.app` mentions in non-ADR docs and code comments — known instances:
  - `roadmap.md:172` and `roadmap.md:229`
  - JSDoc example at `packages/shared/src/room-code.ts:93`
  - Test fixture in `packages/shared/src/room-code.test.ts` (origin-blind parser, fixture-accuracy update only)
  - Tracked as a separate housekeeping task — not a correctness blocker.
- [ ] When the iOS native build (Phase 6b) lands, write the AASA payload at `https://hnch.dev/.well-known/apple-app-site-association` (not `hnch.app`) registering `/join` per ADR-0026 §6.
- [ ] Watch for any future contributor introducing a fresh `hnch.app` reference; the supersession trail in this ADR is the canonical answer.
