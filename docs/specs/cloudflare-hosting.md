# Host hnch on Cloudflare instead of the VPS

**Status:** Draft
**Date:** 2026-10-28
**Source:** free idea (owner, 2026-10-28)

## Problem

The owner asked to "investigate if we could host hnch instead of on the vps on a free tier offering from cloudflare? and also do the domain management / DNS stuff there".

Today hnch runs on one rented IONOS VPS (1 vCPU, 1 GB RAM): Caddy serves the PWA and proxies to the Node relay. The owner pays for the box, patches it, and watches its RAM ceiling. Every relay deploy restarts the process. That causes a 10–30 s outage and wipes every room, live or idle, so a team mid-meeting loses its session. DNS and the domain registration sit at IONOS, separate from the Cloudflare account the owner already uses for other domains.

## Users

- **Host, voter, viewer** (PWA, native app): affected only indirectly. Same URL, same flows. Rooms now survive deploys.
- **CLI user**: must keep working on every released CLI version without an update.
- **Operator** (the owner): no server to run; deploys stay hands-off from CI; DNS lives in the existing Cloudflare account. The registration stays at IONOS.

## Proposed behavior

- Users notice nothing on the surface: `https://hnch.dev` serves the app, room codes and join links work as before, and the native app and installed CLIs connect unchanged.
- A room survives a relay deploy. Everyone may drop for a moment and reconnect on their own, and the room comes back with its rounds and votes. The 24 h "back tomorrow" window (ADR-0012) still holds.
- The operator no longer has a VPS. Releases deploy from CI as today. DNS is managed in Cloudflare; the domain stays registered at IONOS.
- If Cloudflare's free daily limits are ever hit, the relay errors until 00:00 UTC. It never runs up a bill.

## Success criteria

- `hnch.dev` (app and relay) is served by Cloudflare. The VPS is switched off and cancelled.
- The latest released CLI and the current store and native builds create, join, vote and reveal against the new relay with no client release.
- A room created before a relay deploy can be rejoined after it, with its state intact.
- At current usage hnch runs within Cloudflare's free plan. The only recurring cost is the domain renewal at IONOS.
- The e2e suite passes locally and in CI against the new relay.
- `hnch.dev` resolves via Cloudflare nameservers.

## Scope

**In:**
- PWA static hosting on Cloudflare, keeping the single-origin layout (ADR-0029's no-CORS property).
- Relay on Cloudflare with the same HTTP API, WebSocket protocol and close codes (ADR-0016, ADR-0035).
- Room state persisted by the relay so it survives deploys, deleted 24 h after the last peer leaves.
- DNS on Cloudflare (zone created 2026-10-28, Active since 14:17 UTC that day).
- CI deploys for client and relay, local dev and e2e on the new runtime.
- Cutover from the VPS and its decommission.

**Out (explicit anti-goals):**
- Any change to the wire protocol, REST shape, close codes or client behavior.
- New product features riding along.
- Paid Cloudflare plans (Workers Paid stays the fallback only if free limits bite).
- Analytics or telemetry beyond what ADR-0028 allows.
- Email on `hnch.dev`. The owner doesn't use it, so the IONOS mail records were not carried over.
- Moving the registration to Cloudflare Registrar. Out of scope by owner decision (2026-10-28): `hnch.dev` stays registered at IONOS.

## Settled by owner

- Settled 2026-10-28: move DNS to Cloudflare now, DNS-only records, no change for users.
- Settled 2026-10-28 (revised the same day): the registration stays at IONOS; only DNS moves to Cloudflare. A transfer would cost $12.20 for an extra year with no saving now. Reopen only on a materially new fact, such as an IONOS renewal price well above Cloudflare's. No `@hnch.dev` mail is in use.
- Settled 2026-10-28: port the relay to Cloudflare, accepting that room state is stored at Cloudflare (EU-pinned where the platform allows), deleted 24 h after the last peer leaves.

## Open questions

- Does the free plan count incoming WebSocket messages 1:1 or 20:1 against its 100k daily request cap? The docs only state the 20:1 ratio for paid billing.
- Is EU data pinning (Durable Object jurisdiction) available on the free plan?
- Keep the Node relay as a self-host fallback, or delete it once Cloudflare is live?
- `/health` loses its global room and peer counts. Is version plus liveness enough?
- What cutover window is acceptable? The VPS holds rooms in RAM only, so live rooms at switch time are lost once.

## ADR impact

- **ADR-0029** (VPS + Caddy deployment): fully superseded by a new deployment ADR.
- **ADR-0012** (snapshot policy): storage clause ("in-memory only, nothing on disk") superseded. The TTL, keying and content-blindness hold.
- **ADR-0001** (content-blind relay): conforms. The relay still does not parse content, but TLS now terminates at Cloudflare, not on a box the owner runs.
- **ADR-0050** (reconnect reconciliation): conforms, and it makes two relay behaviors load-bearing. A fresh socket must get every presence state the relay holds right away, including after the relay was idle. Unknown rooms and a missing password must stay pre-upgrade HTTP 404 / 400.
- **ADR-0027** (test-only relay surfaces): needs an equivalent on the new runtime.
- **ADR-0049** (self-hosted runner pool): deploy jobs need the Cloudflare tooling on the arm64 runners.
- **ADR-0008, -0009, -0016, -0017, -0024, -0035**: must hold unchanged. They are the compatibility contract.

## References

- ADR-0029, ADR-0012, ADR-0001, ADR-0016, ADR-0024, ADR-0027, ADR-0049
- `docs/deployment.md`, `infra/README.md`
