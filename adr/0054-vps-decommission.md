# ADR-0054: VPS decommission — deploy path removed now, box shut down after the switch

**Status:** Accepted
**Date:** 2026-10-29

Partially supersedes [ADR-0051](0051-cloudflare-hosting.md): its "VPS left idle, not decommissioned" clause and its DNS-only rollback to the VPS. Rest of ADR-0051 holds.

## Context

- [ADR-0051](0051-cloudflare-hosting.md): VPS left idle, not decommissioned. Rollback = set apex records back to DNS-only; Caddy serves the PWA (kept current by `deploy-client.yml`) and relay 1.2.1.
- Relay stopped shipping to the VPS at Phase 1b; VPS relay frozen at `relay-v1.2.1`. Only the PWA still shipped there: `deploy-client.yml` `vps` job, scp + ssh with repo secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, held per job by the runner pool ([ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md)).
- `hnch.dev` apex still DNS-only, pointing at the VPS, until the Phase 3 switch (#549). Measured 2026-10-29: `Server: Caddy`, `/health` version `1.2.1`. Last PWA shipped there: `client-v1.46.0`.
- Usage ≈ 0; no customer base; downtime accepted (ADR-0051).
- `hnch-web` and `hnch-relay` deploy with routes present but inert; their deploys, guards and smokes do not touch the VPS.
- DNS measured 2026-10-29 (`cf dns records list`): NS = Cloudflare; apex A/AAAA DNS-only and `www` A/AAAA proxied, all with the VPS IP as origin. IONOS zone empty (ADR-0051).
- Every existing client tag (≤ `client-v1.46.0`) carries the pre-Phase-2 `deploy-client.yml`: VPS ship only, no `hnch-web` job. A dispatch runs the workflow at that tag.
- Likewise every relay tag ≤ `relay-v1.2.1` carries the pre-1b `deploy-relay.yml`: an SSH deploy to the VPS with no version guard.
- Caddy cert: Let's Encrypt, valid until 2027-01-22 (measured 2026-10-29).
- Registration of `hnch.dev` stays at IONOS (ADR-0051). Whether it is bundled with the VPS contract: unverified.
- Owner settled 2026-10-29 (option 2B): remove the VPS deploy job, VPS docs and VPS infra files now; shut the box down after the switch; accept production frozen until then.

## Decision

The VPS deploy path is removed now: the `vps` job and the `targets` input of `deploy-client.yml`, the VPS files in `infra/` (`Caddyfile`, `bootstrap-vps.sh`, `hnch-relay.service`, `deploy.pub`) and the VPS docs; `deploy-client.yml` deploys `hnch-web` only. After the #549 switch the Cloudflare `hnch.dev` and `www` records are repointed from the VPS IP to a placeholder origin (proxied), the VPS is shut down and its repo secrets deleted, so no VPS rollback remains.

## Trade-offs

- Production frozen until the switch: `hnch.dev` keeps serving PWA `client-v1.46.0` and relay 1.2.1. Client releases land only on inert `hnch-web`; no fix reaches users before the switch.
- Rollback after the switch: while the box still runs, DNS-only reaches the frozen build, not the current one, and only until Caddy's cert lapses: with the apex proxied and `hnch.dev/*` routed to `hnch-web`, the ACME challenge cannot reach Caddy. After shutdown, none. Cloudflare-side fixes only: `wrangler rollback`, fix forward.
- No second host: a Cloudflare outage or a hit daily cap (ADR-0051) has no fallback.
- Rebuilding a VPS needs the deleted files from git history.

## Consequences

- Easier: one deploy target per package; no SSH deploy key on the runner pool once the secrets go; no VPS to patch or pay for after shutdown; docs describe one hosting path.
- Harder: urgent client fix before the switch needs the switch itself; restoring VPS deploys needs a superseding ADR. Post-shutdown incidents are fix-forward only.
- Harder: never re-dispatch a pre-ADR-0054 client tag. While the `VPS_*` secrets live, it deploys to the production VPS and never to `hnch-web`. Roll `hnch-web` back with `wrangler rollback`; dispatch only `main` or a tag cut after this change. The same holds for relay tags ≤ `relay-v1.2.1`: they downgrade the VPS relay.
- Revisit when:
  - Before cancelling the IONOS contract: check whether the `hnch.dev` registration is bundled with the VPS contract; registration must survive cancellation.
  - Switch slips and a client fix must reach users first: do the switch; reversing this decision needs a superseding ADR.
  - Second host or self-host fallback needed: new ADR (ADR-0051 trigger).
