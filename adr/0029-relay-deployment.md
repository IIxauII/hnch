# ADR-0029: Relay deployment — bare-metal VPS with Caddy reverse proxy and single-origin layout

**Status:** Proposed
**Date:** 2026-04-27
**Deciders:** xau

## Context

The relay (`packages/relay`) has so far run only in local development and inside the Playwright e2e harness. To put hnch in front of real users on mobile or PWA, the client needs a stable production `wss://` endpoint with valid TLS, supervised so it survives restarts, and reachable on a memorable hostname.

The constraints driving this decision:

- **Hardware already paid for.** The user owns an IONOS VPS (1 vCPU, 1 GB RAM) and the domain `hnch.dev` (also IONOS-registered). Spending on a separate PaaS is avoidable.
- **Tight RAM budget.** 1 GB total — every long-running daemon (Docker, supervisord, a heavy proxy) competes with the relay's own working set and with Yjs snapshots held in memory per ADR-0012.
- **Snapshots are in-memory only.** Per ADR-0012 ("Ephemeral room snapshot policy"), snapshots live only in the relay process — there is no disk persistence to coordinate across replicas, but conversely there is no way to seamlessly hand off active rooms between instances. A single-instance deployment is consistent with that model; multi-instance would force a snapshot-storage rethink first.
- **The PWA build will land on the same VPS later.** The user wants `hnch.dev` to host the static client and possibly a marketing landing page, with the relay endpoints served from the same hostname. CORS, cookie scope, and share-link UX all simplify when client and relay share an origin.
- **Handshake surface is fixed.** Per ADR-0016, the relay exposes `GET /health`, `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:uuid/access`, and `WS /ws/:uuid`. Whatever fronts the relay must proxy both HTTP and WebSocket upgrades for those paths.
- **TLS automation is required.** The relay carries opaque access tokens (ADR-0009) and PBKDF2-hashed password material on credential exchange (ADR-0017). These are only transport-safe under TLS, and manual cert renewal is a known footgun.
- **Solo operator.** No platform team, no on-call. The deploy and supervision story has to be small enough for one person to keep correct over months.

## Decision

Deploy the relay bare-metal on a single IONOS VPS, supervised by `systemd`, fronted by Caddy as a reverse proxy that terminates TLS via Let's Encrypt. Serve the PWA static build and the relay HTTP/WebSocket endpoints from a single origin (`https://hnch.dev`), with Caddy routing the path prefixes `/health`, `/rooms*`, and `/ws*` to the relay process listening on `127.0.0.1:1234`, and serving everything else from the static client directory on disk.

## Options Considered

### Option A: Bare-metal VPS + Caddy + systemd (CHOSEN)

Caddy fronts Node.js running directly on the host. `hnch-relay.service` is a `systemd` unit that runs `node dist/index.js` as a non-root user with `Restart=always`. Caddy handles TLS issuance and renewal against Let's Encrypt automatically. A single `Caddyfile` block declares the path-based routing for the single-origin layout.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — three moving parts (Node, systemd, Caddy), each well-documented |
| Cost | Zero marginal — VPS and domain already paid for; ~50 MB combined infra footprint leaves headroom on the 1 GB box |
| Scalability | Limited — single instance, vertical only; multi-region or HA requires a different model |
| Team familiarity | High — systemd and reverse proxies are bread-and-butter; Caddy's config is a few lines |

**Pros:**
- Lowest RAM overhead (~50 MB combined for Caddy + systemd machinery), preserving budget for relay process and snapshots.
- Caddy ships Let's Encrypt automation built in — no certbot scripts, no renewal cron to forget.
- Single origin (`hnch.dev`) means no CORS configuration and one TLS cert to manage.
- `systemctl restart hnch-relay` is a one-liner; rollback is a directory swap plus a restart.
- Consistent with ADR-0012's in-memory snapshot model (one process owns all live snapshots).

**Cons:**
- Single instance — every relay deploy causes ~10–30 s of downtime; no blue/green path on one box.
- VPS provisioning is manual unless captured in a bootstrap script; configuration drift on the host is a real risk.
- No built-in horizontal scaling story; growth past one box requires revisiting both this ADR and ADR-0012.
- Abuse mitigation (rate limiting, IP throttling) is not free and needs a follow-up ADR.

### Option B: Docker Compose on the same VPS

A `docker-compose.yml` declares two services: a `relay` container running the Node app, and a `caddy` container handling TLS. Images are built in CI, pushed to a registry (GHCR), and pulled on the VPS during deploy. Volumes carry Caddy's cert cache.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — Docker daemon, Compose file, registry, image tags, network model |
| Cost | Zero monetary marginal; ~150–200 MB RAM overhead from the Docker daemon, material on a 1 GB box |
| Scalability | Same single-host ceiling as Option A; containers don't change the snapshot-locality story |
| Team familiarity | Medium — Docker is broadly familiar but adds operational surface (daemon health, image GC, compose pinning) |

**Pros:**
- Reproducible runtime — image tag is the deploy unit, rollback is `docker compose up` with the previous tag.
- Easier to add sidecars later (Postgres for snapshot persistence, Prometheus exporters, log shippers) without polluting the host.
- Cleaner host: no Node version on the VPS, no global npm packages, no PATH surgery.

**Cons:**
- Docker daemon's RSS (~150–200 MB) is significant against a 1 GB ceiling, directly competing with relay snapshot capacity.
- Extra config layer (Compose + Dockerfile + image registry) for a single-process app on a single box.
- Image registry to maintain and authenticate against, including a CI publish step that doesn't exist today.
- WebSocket upgrade through container networking is fine but adds one more debugging surface vs a direct loopback proxy.

### Option C: Managed PaaS (Fly.io, Railway, Render)

Push to git, the platform builds and deploys, terminates TLS, and gives you a hostname (or accepts a custom domain). Scaling, restarts, and certs are the platform's problem.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low for the happy path; non-trivial when you need persistent volumes, region pinning, or egress control |
| Cost | Recurring monthly fee (typically $5–25/mo for an always-on instance with TLS + custom domain) on top of the IONOS VPS already paid for |
| Scalability | Best of the three — auto-scaling, multi-region, managed load balancing available out of the box |
| Team familiarity | Medium — concepts transfer but every PaaS has its own quirks (build packs, secret stores, healthchecks) |

**Pros:**
- Zero VPS-level operations: no SSH, no `apt`, no systemd, no firewall management.
- Built-in observability (metrics, logs, deploy history) at no extra integration cost.
- Auto-TLS, auto-restart, and a clear scaling lever if traffic grows.
- Trivial to spin up staging environments alongside production.

**Cons:**
- Adds a recurring cost outside the IONOS bundle the user already pays for, with no offsetting benefit at v1 traffic levels.
- Vendor lock-in on build configuration, secret management, and runtime quirks.
- Less control over the runtime (Node version pinning, system libraries, custom syscall surface) — fine today, awkward later.
- Doesn't help solve the PWA static-hosting story on the same origin without further configuration on the same or another platform, or a CDN in front.

## Trade-off Analysis

The chosen option (A) trades **operational maturity** — single-instance downtime, no native scaling, manual VPS provisioning — for **cost efficiency** and **full control on hardware the user already owns**. At expected v1 traffic (small teams, intermittent sessions), the operational gaps are not yet load-bearing; at the point they become load-bearing, the revisit triggers below will fire.

A few sub-decisions inside Option A worth naming explicitly:

- **Caddy over nginx.** Both are competent reverse proxies and both proxy WebSockets cleanly. Caddy was chosen because Let's Encrypt automation is built into the binary — no certbot scripts, no renewal cron, no separate ACME client to babysit. The `Caddyfile` for a single-origin setup with two route groups is shorter than the equivalent nginx config plus its certbot orchestration.
- **Bare-metal over Docker.** Docker's daemon overhead (~150–200 MB RAM) is non-trivial against a 1 GB ceiling. The relay is a single Node process today with no sidecars; the reproducibility benefit Docker offers does not yet outweigh the memory cost. If the deployment ever needs sidecars (Postgres, metrics agent, log shipper), this trade-off should be revisited.
- **Single origin (`hnch.dev`) over `relay.hnch.dev`.** A separate relay subdomain would have meant CORS configuration on the relay, two certs, and share-link URLs that straddle two hostnames. A single origin keeps the join URL `hnch.dev/j/ABC123` clean (per ADR-0026's `${appBaseUrl}/join?code=XXXXXX` format), eliminates CORS entirely, and means one cert to monitor.
- **systemd over a process manager (pm2, forever).** systemd is already on the box, integrates with the host's logging and restart story, and has no extra dependency to keep current. A user-space process manager would add a moving part with no offsetting benefit on a single-app host.

What we give up: a graceful-restart story, a horizontal-scale story, and any built-in observability. Each of those is a future ADR, not a v1 blocker.

## Consequences

**Easier:**
- One VPS, one TLS cert, one origin to reason about — operational mental model fits in your head.
- PWA join links and relay endpoints share the same hostname (`hnch.dev`), so no CORS, no mixed-origin cookie quirks, and share-link UX stays clean.
- Adding the PWA static deploy later is just another `Caddyfile` route block plus an `rsync` target — no new infrastructure.
- Rollback is a directory swap (`/opt/hnch-relay/current` symlink) plus `systemctl restart hnch-relay` — fast and obvious.
- TLS renewal is invisible — Caddy handles ACME end-to-end, including OCSP stapling.

**Harder:**
- Each relay deploy causes ~10–30 s of downtime; no blue/green or rolling-restart path exists on a single instance. Active sessions experience a reconnect storm (mitigated by ADR-0025's reconnect/backoff posture, but still visible).
- The 1 GB RAM ceiling means memory pressure becomes real once concurrent connection counts climb. This needs monitoring — even a coarse "RSS over time" graph — before traffic grows.
- No abuse mitigation (rate limiting, IP throttling, slow-loris protection) is in scope here. A follow-up ADR will need to add Caddy's `rate_limit` directive or fronting middleware before the relay is exposed to untrusted traffic at scale.
- VPS provisioning must be reproducible via the bootstrap script in `infra/`. Manual changes on the host (out-of-band `apt install`, hand-edited config) will break repeatability and create subtle drift.

**Revisit triggers:**
- **Capacity.** Sustained > 1 k concurrent connections, or relay RSS approaching 800 MB. Either signal means the single-instance model is at its ceiling.
- **Geography.** Need for multi-region presence (latency-sensitive cohorts outside Europe) — single-VPS deployment cannot satisfy this.
- **Persistence model change.** Any move away from ADR-0012's "ephemeral, in-memory only" snapshots would mean snapshots survive restarts and could be shared across replicas — opening (and requiring) a multi-instance deployment story.
- **Hardware change.** Acquisition of a second VPS, or a strategic move to PaaS for HA or cost reasons.
- **Security incident.** Any abuse incident before rate-limiting lands should accelerate the mitigation ADR rather than this one.

## Action Items

- [ ] Add infra files: `infra/Caddyfile`, `infra/hnch-relay.service`, `infra/bootstrap-vps.sh`, `infra/README.md`.
- [ ] Add `packages/relay/.releaserc.json` so the relay gets independent semantic-release tags (parallel to `shared` and `cli`).
- [ ] Add `.github/workflows/deploy-relay.yml`, triggered on `relay-v*` tags, that rsyncs the build and runs `systemctl restart hnch-relay` over SSH.
- [ ] Add `docs/deployment.md` runbook covering first-time provisioning, deploys, rollback, log inspection, and cert troubleshooting.
- [ ] Set DNS A record `hnch.dev` → `<vps-ip>` in the IONOS panel (manual, one-time).
- [ ] Generate a dedicated CI deploy keypair, install the public key via `bootstrap-vps.sh`, and store the private key in GitHub Actions secret `VPS_SSH_KEY`.
- [ ] Set GitHub Actions secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
- [ ] Smoke test: `curl -fsS https://hnch.dev/health` returns 200 after the first deploy.
- [ ] Update `CLAUDE.md` "Current decisions at a glance" with a one-line entry referencing this ADR (the ADR author cannot edit `CLAUDE.md` directly — flag for orchestrator).
- [ ] After two weeks of production traffic, capture an RSS-over-time graph and re-evaluate whether the abuse-mitigation ADR needs to be brought forward.

## Status notes

**2026-04-28 — PWA static host realized.** The PWA layout described in §Consequences ("just another Caddyfile route block plus rsync target") is now wired: `/var/www/hnch-client` symlink → release dirs under `/var/www/hnch-client-releases/`, `deploy-client.yml` mirrors `deploy-relay.yml` on `client-v*` tags, atomic activation via symlink swap (no Caddy reload). Service worker / installable PWA deferred from v1 (plain SPA only). See `infra/README.md` and `plans/plan-pwa-deploy.md`.
