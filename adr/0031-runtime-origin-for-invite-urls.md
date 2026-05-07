# ADR-0031: Runtime `window.location.origin` for invite URLs (supersedes ADR-0026 §1 origin clause)

**Status:** Accepted — supersedes the origin clause of [ADR-0026](0026-deep-link-url-format.md) (Decision §1). All other clauses of ADR-0026 remain in force.
**Date:** 2026-04-29

## Context

- [ADR-0026](0026-deep-link-url-format.md) committed URL shape `${appBaseUrl}/join?code=XXXXXX` with `appBaseUrl` as build-time constant from `environment{.prod}.ts`.
- Production `appBaseUrl = 'https://hnch.dev'` matches single-origin deploy ([ADR-0029](0029-relay-deployment.md)). Single consumer: `lobby.page.ts:463`.
- Parallel git worktrees each run dev relay + Angular dev server on different ports (4200, 4300, 4400). Build-time constant breaks this:
  - Every worktree's dev build inherits hardcoded `localhost:4200`.
  - QR minted on port 4300 encodes URL pointing at port 4200 — wrong worktree or nothing.
  - Phone-scans-laptop loops land in wrong session.
- Constant is also redundant in prod: PWA served from `hnch.dev` so `appBaseUrl` always equals `window.location.origin` by construction.

## Decision

Replace build-time `appBaseUrl` with `window.location.origin`, evaluated at link-mint time inside `inviteUrl` computed signal. Remove the field from both env files. All other clauses of [ADR-0026](0026-deep-link-url-format.md) remain in force (path, query param, normalization, auto-submit, no-password-in-URL, public-contract immutability of *shape*, AASA path-prefix exclusivity, CLI parity). CLI's `DEFAULT_RELAY_URL` + `HNCH_RELAY_URL` ([ADR-0021](0021-cli-package.md)) untouched — relay URL ≠ app origin.

## Options

- **A — `window.location.origin` at mint time (chosen):** Pros: constant was redundant in prod and wrong in dev; multiple worktrees correct without rebuild; preview/staging deploys work for free; AASA still pinned via manifest. Cons: dev minter on `localhost:4300` could paste a localhost URL into Slack — bounded to dev loop, can't affect end users.
- **B — Per-worktree env files (`environment.worktree-b.ts`):** Pros: keeps build-time pattern. Cons: every worktree adds config artifact; hand-maintains value `ng serve` already knows; forgetting rebuild → stale URLs silently.
- **C — Build-time env-var override (`HNCH_APP_BASE_URL`):** Pros: mirrors CLI's `HNCH_RELAY_URL`. Cons: CLI's var exists because no `window.location` analogue; PWA has one and it's always correct by construction; solving non-problem.
- **D — Runtime in dev, constant in prod:** Pros: minimal prod change. Cons: prod constant always equals runtime origin → branch pays complexity for tautology; footgun if future build flag makes prod's constant lie.

## Trade-offs

- AASA manifest at `https://hnch.dev/.well-known/apple-app-site-association` becomes the *only* place production origin is pinned in code. Sufficient — AASA is what tells iOS which origin's `/join` URLs to hand off.
- Production origin no longer named in client repo source files — readers must consult [ADR-0029](0029-relay-deployment.md) or AASA manifest.
- Dev loop now self-evidently shows `localhost:PORT` cue ("don't share this") rather than a misleading `localhost:4200`.

## Consequences

- Easier: parallel worktrees mint correct URLs without rebuild; preview/staging deploys auto-correct; env files shrink to actually-environment-dependent set; future origin changes need zero client-code change.
- Harder: prod origin not named in source; ngrok/proxy contexts mint that origin's URL (desired but a behavior shift).
- Revisit when: subdomain split / multi-origin (e.g., `app.hnch.dev` vs `hnch.dev` marketing) — successor ADR pins canonical origin; embedded-webview contexts where runtime origin isn't reachable; AASA behavior requires client to know its canonical origin (e.g., explicit "Open in App" universal-link construction).

## Action Items

- [ ] Remove `appBaseUrl` from `packages/client/src/environments/environment.ts` and `environment.prod.ts`.
- [ ] Replace `${environment.appBaseUrl}/join?code=${code}` at `packages/client/src/app/lobby/lobby.page.ts:463` with `${window.location.origin}/join?code=${code}` (verify line at change time).
- [ ] Edit ADR-0026 status header to reference this ADR superseding §1; update `adr/README.md` index.
- [ ] Flip stale `hnch.app` references in `roadmap.md:172`, `roadmap.md:229`, JSDoc at `packages/shared/src/room-code.ts:93` to `hnch.dev` (parser is origin-blind by ADR-0026 design — docs-accuracy fix).
- [ ] When Phase 6b lands, write AASA payload at `https://hnch.dev/.well-known/apple-app-site-association` registering `/join` per [ADR-0026](0026-deep-link-url-format.md) §6.
- [ ] Verify Playwright/e2e tests assert against `window.location.origin`, not hardcoded `localhost:4200`.
- [ ] **Revisit watch:** if a contributor reintroduces `appBaseUrl`, this ADR is the canonical refutation — require successor ADR.
