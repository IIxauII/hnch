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
- Registration of `hnch.dev` stays at IONOS (ADR-0051). Whether it is bundled with the VPS contract: unverified.
- Owner settled 2026-10-29 (option 2B): remove the VPS deploy job, VPS docs and VPS infra files now; shut the box down after the switch; accept production frozen until then.

## Decision

The VPS deploy path is removed now: the `vps` job and the `targets` input of `deploy-client.yml`, the VPS files in `infra/` (`Caddyfile`, `bootstrap-vps.sh`, `hnch-relay.service`, `deploy.pub`) and the VPS docs; `deploy-client.yml` deploys `hnch-web` only. After the #549 switch the VPS is shut down and its repo secrets and IONOS DNS entries removed, so no VPS rollback remains.

## Trade-offs

- Production frozen until the switch: `hnch.dev` keeps serving PWA `client-v1.46.0` and relay 1.2.1. Client releases land only on inert `hnch-web`; no fix reaches users before the switch.
- Rollback after the switch: while the box still runs, DNS-only reaches the frozen build, not the current one. After shutdown, none. Cloudflare-side fixes only: `wrangler rollback`, fix forward.
- No second host: a Cloudflare outage or a hit daily cap (ADR-0051) has no fallback.
- Rebuilding a VPS needs the deleted files from git history.

## Consequences

- Easier: one deploy target per package; no SSH deploy key on the runner pool once the secrets go; no VPS to patch or pay for after shutdown; docs describe one hosting path.
- Harder: urgent client fix before the switch needs the switch itself (or a revert of this change); post-shutdown incidents are fix-forward only.
- Revisit when:
  - Before cancelling the IONOS contract: check whether the `hnch.dev` registration is bundled with the VPS contract; registration must survive cancellation.
  - Switch slips and a client fix must reach users first: do the switch, or revert this change; no new ADR.
  - Second host or self-host fallback needed: new ADR (ADR-0051 trigger).
