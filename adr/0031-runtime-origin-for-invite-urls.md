# ADR-0031: Runtime `window.location.origin` for invite URLs (supersedes ADR-0026 §1 origin clause and ADR-0030)

**Status:** Accepted — supersedes the origin clause of [ADR-0026](0026-deep-link-url-format.md) (Decision §1) and the entirety of [ADR-0030](0030-canonical-origin-hnch-dev.md). All other clauses of ADR-0026 remain in force.
**Date:** 2026-04-29
**Deciders:** Xau

## Context

[ADR-0026](0026-deep-link-url-format.md) ("Deep-link URL format") committed the deep-link / invite URL shape as `${appBaseUrl}/join?code=XXXXXX`, where `appBaseUrl` is a build-time constant sourced from `packages/client/src/environments/environment{.prod}.ts`. [ADR-0030](0030-canonical-origin-hnch-dev.md) corrected the production origin string from `hnch.app` to `hnch.dev` to match the actual deployment recorded in [ADR-0029](0029-relay-deployment.md). At the time of writing, the constants are:

- `packages/client/src/environments/environment.ts:17` — `appBaseUrl: 'http://localhost:4200'`
- `packages/client/src/environments/environment.prod.ts:16` — `appBaseUrl: 'https://hnch.dev'`

The single consumer is `packages/client/src/app/lobby/lobby.page.ts:463`:

```ts
return code ? `${environment.appBaseUrl}/join?code=${code}` : ''
```

A new development workflow is now in play: parallel git worktrees, each running its own dev relay + Angular dev server on a different port (e.g., `main` on `4200`, a feature worktree on `4300`, a third on `4400`). The existing build-time `appBaseUrl` constant breaks this workflow:

1. Every worktree's dev build inherits the same hardcoded `http://localhost:4200`, regardless of which port that worktree's dev server actually listens on.
2. A QR code minted by a worktree running on port `4300` encodes a URL pointing at port `4200` — the *other* worktree's dev server, or nothing if it isn't running.
3. Phone-scans-laptop test loops therefore land in the wrong worktree's session, or fail to load entirely. The room code is correct but the origin is a lie.

The existing `appBaseUrl` constant is also redundant in production: the PWA is served from `hnch.dev`, so when production code reads `appBaseUrl` it is reading a value that — by construction — equals `window.location.origin`. The constant carries no information the runtime doesn't already have. Its only effect today is to be wrong in dev (when the port differs from 4200) and accurate-but-redundant in prod.

A reasonable contributor could have addressed the worktree problem by introducing a per-worktree env-file convention, by reading the port from `window.location` only in dev, or by building a runtime override surface (`HNCH_APP_BASE_URL` analogous to the CLI's `HNCH_RELAY_URL`). Each carries cost. This ADR records why we chose the simplest available answer — read the origin from the runtime — and what we give up by retiring the build-time constant.

## Decision

Replace the build-time `appBaseUrl` constant with `window.location.origin`, evaluated at link-mint time (i.e., inside the `inviteUrl` computed signal).

Specifically:

1. Remove the `appBaseUrl` field from both `packages/client/src/environments/environment.ts` and `packages/client/src/environments/environment.prod.ts`.
2. Replace `${environment.appBaseUrl}/join?code=${code}` at `packages/client/src/app/lobby/lobby.page.ts:463` with `${window.location.origin}/join?code=${code}`.
3. All other clauses of [ADR-0026](0026-deep-link-url-format.md) remain in force unchanged: URL path `/join`, query parameter `code`, normalization rules (liberal accept, exact mint per `normalizeRoomCode`), auto-fill / auto-submit on landing, no-password-in-URL, public-contract immutability of the *shape*, AASA path-prefix exclusivity, and the CLI normalization-parity contract. This ADR supersedes ADR-0026 **only** in its origin clause (Decision §1).
4. [ADR-0030](0030-canonical-origin-hnch-dev.md) is fully superseded. The production origin remains `hnch.dev` as a deployment fact (per [ADR-0029](0029-relay-deployment.md)) and as the AASA-binding target (Phase 6b), but is no longer recorded as a build-time constant in client environment files. The pinning recorded in ADR-0030 was a build-time pinning; with the constant retired, there is nothing to pin.

The CLI's `DEFAULT_RELAY_URL = 'https://hnch.dev'` and the `HNCH_RELAY_URL` env override (per [ADR-0021](0021-cli-package.md)) are unaffected. The CLI talks to the *relay*; this ADR is about the PWA's *app origin* used to mint invite links. They are separate concerns and stay separate.

## Options Considered

### Option A: Use `window.location.origin` at link-mint time (CHOSEN)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one-line change in `lobby.page.ts`, two-line removal in env files |
| Cost | None — no new infra, no new env vars, no new build step |
| Worktree-correctness | Full — origin always matches the host the user is actually on |
| Production behavior | Identical — origin equals `https://hnch.dev` because that's what serves the PWA |
| Preview/staging support | Free — Cloudflare preview hosts, Caddy variants, ad-hoc tunnels all just work |
| AASA binding | Unaffected — still pinned to `hnch.dev` via the AASA payload (`applinks:hnch.dev`), which is a manifest concern not a runtime concern |

**Pros:** the constant was redundant in prod (always equal to `window.location.origin`) and wrong in dev (didn't match the actual port when worktrees diverge). Removing it lets the runtime tell the truth. Multiple parallel worktrees produce correctly-portioned invite URLs without a rebuild or per-worktree config. Preview deploys (Cloudflare preview branches, staging Caddy variants) get correct invite URLs for free — the URL the tester is on is the URL the tester shares.

**Cons:** the URL minted is now whatever origin the *minter* happens to be on. If a developer happens to be on `http://localhost:4300` and mints a link, they may copy a `localhost:4300` URL into a Slack thread by accident. Production cannot do this — production is always served from `hnch.dev`, and there is no other origin the PWA can be loaded from in prod (Caddy is the single edge per [ADR-0029](0029-relay-deployment.md)). In dev, the cost of the mistake is bounded to the developer's own loop; it cannot affect end users.

### Option B: Per-worktree env files (e.g., `environment.worktree-b.ts` with port 4300)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — a build-config knob per worktree, plus discipline to rebuild when switching |
| Cost | Ongoing — every new worktree requires a config edit |
| Worktree-correctness | Brittle — relies on the developer remembering to rebuild with the right config |
| Production behavior | Unchanged |
| Preview/staging support | Requires another env file per preview |

**Pros:** keeps the build-time constant pattern; no runtime read of `window.location`. Each environment is explicit.

**Cons:** every worktree adds a config artifact. The `appBaseUrl` becomes a value the developer must keep in sync with the dev server's actual port — which `ng serve` already knows. We'd be hand-maintaining a duplicate. Forgetting to rebuild after switching worktrees produces stale URLs silently. The complexity multiplies if previews / staging join the matrix.

### Option C: Env-var override (`HNCH_APP_BASE_URL`) read at build time

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — a build-time env-var read, plus a fallback default |
| Cost | One env var per shell context |
| Worktree-correctness | Same as B if developer remembers to set it; same failure mode if they don't |
| Production behavior | Unchanged |
| Preview/staging support | Per-deploy var |

**Pros:** mirrors the CLI's `HNCH_RELAY_URL` pattern, which is already familiar.

**Cons:** the CLI's `HNCH_RELAY_URL` exists because the CLI needs to talk to a relay whose URL is *not* the URL the CLI is running from — there is no analogue of `window.location` for a CLI. The PWA does have such an analogue, and it is always correct by construction. Adding an env var to override a value the runtime already knows is solving a problem we don't have. Preview / staging / worktree contexts don't need a new override surface; they need the runtime to stop lying.

### Option D: Read `window.location.origin` only in dev, keep `appBaseUrl` in prod

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — `environment.production ? environment.appBaseUrl : window.location.origin` |
| Cost | None |
| Worktree-correctness | Full in dev |
| Production behavior | Unchanged |
| Code clarity | Lower — two code paths for one concern |

**Pros:** minimal change in production; preserves the build-time constant as a "production-pinned" value.

**Cons:** the production constant is, again, always equal to `window.location.origin` by construction. The branch is paying complexity to express "in prod, use the value that already equals the runtime; in dev, use the runtime." The simpler statement is "always use the runtime." The dual-mode shape also leaves a footgun — a future contributor might add a build flag that makes prod's origin diverge from the served origin, at which point the constant starts lying again.

## Trade-off Analysis

Option A wins because the build-time constant was carrying no information the runtime doesn't already have, while introducing a worktree-correctness bug. The right fix is to remove the redundant constant rather than to teach it more contexts.

What we give up: the AASA binding is now the *only* place where the production origin string is pinned in code (technically, in the AASA manifest at `https://hnch.dev/.well-known/apple-app-site-association`, plus any `applinks:hnch.dev` reference in iOS build artifacts). That pinning is sufficient — the AASA payload is what tells iOS which origin's `/join` URLs to hand off to the app. ADR-0026 §6's path-prefix exclusivity rule still constrains the *path*; this ADR removes the build-time constant that named the *origin*, on the grounds that the origin is now told by the runtime in the PWA and by the AASA manifest in iOS. Both are runtime sources of truth, neither is a build-time constant.

What ADR-0030 added: ADR-0030 corrected the origin string from `hnch.app` to `hnch.dev`, and recorded that correction as a build-time constant. With the constant retired, the correction is moot — there is no constant to be `hnch.app` or `hnch.dev`. Production is served from `hnch.dev` because that's where Caddy listens (per [ADR-0029](0029-relay-deployment.md)), and that fact does not change. ADR-0030 is therefore fully superseded: its effect is preserved by the deployment ADR and by the AASA manifest, neither of which this ADR touches.

What we keep: every other clause of ADR-0026 — the URL shape, the normalization, the auto-submit, the no-password-in-URL rule, the path-prefix exclusivity, the CLI parity contract — is untouched. This is a narrow change to *how* the origin enters the URL string, not *what* the URL string looks like to a recipient. A user who has bookmarked or scanned an `hnch.dev/join?code=…` URL sees no change.

## Consequences

**Easier:**
- Parallel worktrees now produce correct invite URLs — port `4300` mints links pointing at port `4300`, no rebuild, no config edit.
- Preview / staging deploys (Cloudflare preview, ad-hoc Caddy variants, future review apps) automatically mint invite URLs for the host the tester is on. No deploy-time origin override surface needed.
- The environment files lose a redundant field. `environment.ts` and `environment.prod.ts` shrink to relay URLs + version, which is the actually-environment-dependent set.
- Future origin changes (e.g., subdomain split, marketing-domain experiment) require zero client-code change — wherever the PWA is served, that's the origin minted into invite links.

**Harder:**
- A developer minting a link in dev who then pastes it into Slack pastes a `localhost:PORT` URL. This is not a regression — the previous behavior pasted a `localhost:4200` URL, which was *also* wrong in any sharing context. The runtime version at least matches the tab the developer was on, which makes the "this is a dev link, don't share it" cue self-evident.
- The production origin is no longer named in the client repo's source files. A reader trying to answer "what origin does prod use?" must look at [ADR-0029](0029-relay-deployment.md) (Caddy + DNS) or the AASA manifest, not at `environment.prod.ts`. The supersession breadcrumb on ADR-0030 plus the deployment ADR's explicit `hnch.dev` mention is the mitigation.
- If the PWA is ever loaded from an unexpected origin (e.g., a contributor proxies it through `ngrok` for a phone-test session), invite URLs will be minted for that origin. That is in fact the desired behavior — the QR code points at the URL the phone can actually reach — but it is a behavior shift for anyone who assumed the constant was a hard pin.

**Revisit triggers:**
- **Subdomain split or multi-origin strategy.** If the project later wants a marketing landing page on a different origin from the app (e.g., `app.hnch.dev` for the PWA, `hnch.dev` for marketing), invite URLs minted from the marketing site would point at the marketing site rather than the app. At that point a deliberate canonical-origin decision returns and a successor ADR records it.
- **Loaded-from-unexpected-origin becomes a real concern.** If, e.g., embedded webview contexts (Slack unfurl preview, in-app browsers) load the PWA from a URL the host can't actually reach, the runtime origin would be a poor source of truth. The mitigation would be to detect such contexts and refuse to mint links — a small UX feature, not an architectural change.
- **AASA/applinks behavior changes** in a way that requires the client to *know* its canonical origin (e.g., to render an `Open in App` button that constructs an explicit universal link). At that point the canonical origin returns as a constant — but it returns somewhere meaningful, not redundantly.

## Action Items

- [ ] Remove the `appBaseUrl` field from `packages/client/src/environments/environment.ts` and `packages/client/src/environments/environment.prod.ts`.
- [ ] Replace `${environment.appBaseUrl}/join?code=${code}` at `packages/client/src/app/lobby/lobby.page.ts:463` with `${window.location.origin}/join?code=${code}`. Verify the line number against the source at change time.
- [ ] Edit ADR-0026's status header to add `; Decision §1 (origin clause) further superseded by ADR-0031`. Update the `adr/README.md` index entry to mention the further supersession.
- [ ] Edit ADR-0030's status header to `Superseded by ADR-0031` and update the `adr/README.md` index entry to match.
- [ ] **Inherited from ADR-0030 — still owed, not moot.** `roadmap.md:172` and `roadmap.md:229` still contain literal `hnch.app` references (verified at the time of writing this ADR; both lines mention `hnch.app` — line 172 quotes the old invite URL example, line 229 names the AASA host). ADR-0030's intent — and now this ADR's inherited responsibility — is to flip `hnch.app → hnch.dev` in those lines so the documentation matches the deployment reality recorded in [ADR-0029](0029-relay-deployment.md). Production behavior is unchanged by this ADR, but the stale strings are still in the repo and the housekeeping is **not moot post-supersession**: it is carried forward here as the open obligation it was when ADR-0030 was written. (Source-file edits are out of scope for the ADR-author role; tracked here so a follow-up sweep does not lose them.)
- [ ] **Inherited from ADR-0030 — still owed, not moot.** `packages/shared/src/room-code.ts:93` JSDoc still uses `https://hnch.app/join?code=K7P9MR` as the example URL (verified at the time of writing this ADR). Flip the example origin to `hnch.dev` so the JSDoc matches the deployment reality. The `parseInviteContent` parser is origin-blind by ADR-0026 design (it consumes only the `code` query parameter), so this is a docs-accuracy fix and not a parser-correctness fix — but it is **still owed**; the supersession does not retire it. (Source-file edits are out of scope for the ADR-author role; tracked here so a follow-up sweep does not lose them.)
- [ ] **Inherited from ADR-0030.** When the iOS native build (Phase 6b) lands, write the AASA payload at `https://hnch.dev/.well-known/apple-app-site-association` registering `/join` per ADR-0026 §6. The applinks binding is the *only* remaining build-time pin of the production origin string, and it lives in the AASA manifest, not in client environment files.
- [ ] Update CLAUDE.md "Current decisions at a glance" — the deployment bullet already names `hnch.dev` correctly; if a deep-link bullet is later added per ADR-0026's open action items, it should describe the origin as "the origin the PWA is served from" rather than as a build-time constant. Flag for the orchestrator if not done with this ADR.
- [ ] If a Playwright / e2e test ever asserts on the literal text of an invite URL, ensure it is asserting against `window.location.origin` rather than a hardcoded `localhost:4200`. Tracked as a verification step on the e2e suite.
- [ ] **Revisit watch.** If a future contributor reintroduces an `appBaseUrl` constant (for any reason), this ADR is the canonical refutation; require a successor ADR before accepting the change.
