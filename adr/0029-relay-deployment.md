# ADR-0029: Relay deployment — bare-metal VPS with Caddy reverse proxy and single-origin layout

**Status:** Accepted (runner-location clause superseded by ADR-0049)
**Date:** 2026-04-27

## Context

- Relay needs stable production `wss://` endpoint, valid TLS, supervised, on memorable hostname.
- IONOS VPS (1 vCPU, 1 GB RAM) + `hnch.dev` already paid for.
- Tight 1 GB RAM ceiling — every long-running daemon competes with Yjs snapshots ([ADR-0012](0012-snapshot-policy.md)).
- In-memory-only snapshots → single-instance deploy consistent; multi-instance forces snapshot-storage rethink.
- PWA static + relay endpoints from same hostname simplifies CORS, cookie scope, share-link UX.
- Handshake surface fixed by [ADR-0016](0016-client-relay-connection-handshake.md): `/health`, `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:uuid/access`, `WS /ws/:uuid`.
- TLS automation required — opaque tokens ([ADR-0009](0009-access-control-relay-tokens.md)) + PBKDF2 material ([ADR-0017](0017-password-hashing-drop-invite-only.md)) only transport-safe under TLS; manual cert renewal = footgun.
- Solo operator, no platform team.

## Decision

Bare-metal IONOS VPS, Node relay supervised by `systemd`, Caddy reverse proxy terminating TLS via Let's Encrypt. Single origin `https://hnch.dev` — Caddy routes `/health`, `/rooms*`, `/ws*` to `127.0.0.1:1234`; everything else served from static client dir.

## Trade-offs

- Caddy over nginx: built-in ACME, no certbot to babysit, shorter config for two-route single-origin.
- Bare-metal over Docker: ~150–200 MB daemon RAM vs 1 GB ceiling outweighs reproducibility benefit for single-process app.
- Single origin over `relay.hnch.dev` subdomain: no CORS, one cert, clean join URL ([ADR-0026](0026-deep-link-url-format.md)).
- systemd over pm2/forever: already on box, integrates with journald, no new dep.
- Managed PaaS (Fly/Railway/Render) rejected: $5–25/mo recurring on top of paid IONOS; vendor lock-in; doesn't solve same-origin PWA hosting without further config.
- Give up: graceful-restart, horizontal scale, built-in observability — each a future ADR, not v1 blocker.

## Consequences

- Easier: one VPS / cert / origin; PWA + relay share hostname → no CORS; PWA deploy = another Caddy block + rsync target; rollback = symlink swap + restart; TLS renewal invisible.
- Harder: 10–30 s downtime per deploy (reconnect storm mitigated by [ADR-0025](0025-reconnect-backoff.md)); 1 GB ceiling needs RSS monitoring; no abuse mitigation in scope here; manual host changes break repeatability.
- Revisit when: sustained > 1 k concurrent connections OR RSS approaching 800 MB; multi-region geography demand; ADR-0012 persistence model changes; second VPS / PaaS pivot; abuse incident before rate-limiting lands.

## Status notes

**2026-04-28 — PWA static host realized.** `/var/www/hnch-client` symlink → release dirs under `/var/www/hnch-client-releases/`; `deploy-client.yml` mirrors `deploy-relay.yml` on `client-v*` tags; atomic activation via symlink swap (no Caddy reload). Service worker / installable PWA deferred from v1. See `infra/README.md` and `plans/plan-pwa-deploy.md`.
