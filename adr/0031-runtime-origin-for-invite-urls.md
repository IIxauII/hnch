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

## Trade-offs

- AASA manifest at `https://hnch.dev/.well-known/apple-app-site-association` becomes the *only* place production origin is pinned in code. Sufficient — AASA is what tells iOS which origin's `/join` URLs to hand off.
- Production origin no longer named in client repo source files — readers must consult [ADR-0029](0029-relay-deployment.md) or AASA manifest.
- Dev loop now self-evidently shows `localhost:PORT` cue ("don't share this") rather than a misleading `localhost:4200`.
- Dev minter on `localhost:4300` could paste localhost URL into Slack — bounded to dev loop, can't affect end users.

## Consequences

- Easier: parallel worktrees mint correct URLs without rebuild; preview/staging deploys auto-correct; env files shrink to actually-environment-dependent set; future origin changes need zero client-code change.
- Harder: prod origin not named in source; ngrok/proxy contexts mint that origin's URL (desired but a behavior shift).
- Revisit when: subdomain split / multi-origin (e.g., `app.hnch.dev` vs `hnch.dev` marketing) — successor ADR pins canonical origin; embedded-webview contexts where runtime origin isn't reachable; AASA behavior requires client to know its canonical origin.
