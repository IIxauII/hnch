# ADR-0058: Markdown for agents — `hnch-web` runs a Worker on page paths

**Status:** Accepted
**Date:** 2026-11-11

Partially supersedes [ADR-0051](0051-cloudflare-hosting.md): its `hnch-web` topology clause ("Workers Static Assets from `www`, SPA fallback, no `run_worker_first`"). Everything else in ADR-0051 holds.

## Context

- Agents fetch pages with `Accept: text/markdown`. Every page on `hnch.dev` answers `index.html`: an empty Angular shell (`<app-root></app-root>`), no content without JS. isitagentready.com's `markdownNegotiation` check fails (2026-11-11).
- Cloudflare Markdown for Agents (zone setting `content_converter`, HTML converted at the edge) is Pro, Business and Enterprise only. Zone `hnch.dev` is Free; ADR-0051: Free plan only, never a bill. Converting the empty shell would yield almost nothing anyway.
- ADR-0051 kept `hnch-web` assets-only so asset requests stay off the Workers Free request budget (100k/day per account, shared with `hnch-relay`).
- Workers Static Assets with `run_worker_first` as a list (Cloudflare docs, SPA routing; checked on local workerd, wrangler 4.151.3):
  - Only matching paths invoke the Worker. Every other request is served as an asset, SPA fallback included; the `Sec-Fetch-Mode: navigate` routing is off.
  - `_headers` still applies to responses the Worker fetches through the assets binding.

## Decision

`hnch-web` gets a Worker (`packages/client/worker/index.ts`) with `run_worker_first: ["/*", "!/*.*"]`: it runs for every path without a dot (the pages) and never for a file. A GET or HEAD that prefers `text/markdown` gets `/index.md` (hand-written, copied into `www`) as `text/markdown; charset=utf-8` with `x-markdown-tokens`; any other request gets the assets' own answer. Both carry `Vary: Accept`.

- One Markdown document for every page path. No per-route content; nothing from the URL is echoed.
- Deploy guard pins `main`, `assets.binding: "ASSETS"`, that exact `run_worker_first`, and Workers Logs off: page URLs carry room codes ([ADR-0028](0028-telemetry-posture.md) posture).
- Deploy refuses a `www` without `index.md`. The Worker falls back to HTML if it is missing anyway.

## Trade-offs

- Every page load is a billed Worker request: about one per tab opened. Files stay free.
- A flood of page requests drains the shared 100k/day budget and takes the relay down with it. Already true of `/health` (ADR-0051 abuse exposure, owner accepted); one more cheap path.
- At the daily request limit the pages go down with the relay (fail mode unverified, ADR-0051). Before, the static shell outlived the relay; it was useless without it.
- Page loads gain a hop (Worker → assets binding). CPU well under 1 ms of the Free plan's 10 ms.
- `index.md` restates product facts by hand. Unit tests pin the scales, the participant cap and the code format to `@hnch/shared`; the rest can drift.
- A path with a dot never negotiates. No app route has one.
- The Markdown variant drops its `ETag`: agents re-download it (about 3 KB) instead of revalidating.

## Consequences

- Easier: agents get readable content at every page URL with no plan upgrade. The logic lives in the repo, is unit-tested, and deploys and rolls back with `hnch-web` (`wrangler rollback`).
- Harder: `hnch-web` is code, not config only. Page availability is tied to the daily Workers request cap.
- Revisit when:
  - A daily Workers request cap is hit: narrow `run_worker_first` (e.g. `/` only) or move to Workers Paid (ADR-0051 trigger).
  - Zone moves to Pro, or the app prerenders HTML: Cloudflare's converter becomes an option.
  - An app route gets a dot in its path.
