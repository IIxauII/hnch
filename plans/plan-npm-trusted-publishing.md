# Migrate `@xauyxau/hnch` to npm Trusted Publishing (OIDC)

**Status:** documented, not yet executed.
**Date:** 2026-04-28

## Context

`@xauyxau/hnch` currently publishes from CI using a long-lived granular `NPM_TOKEN` stored as a GitHub Actions secret (set via `gh secret set NPM_TOKEN`). The token was bootstrapped because npm's Trusted Publishing binding UI is exposed only on the per-package settings page AFTER the package's first publish — a chicken-egg the bootstrap solved.

Now that `@xauyxau/hnch@1.1.2` exists on the registry, that binding UI is available at `https://www.npmjs.com/package/@xauyxau/hnch/access`. Switching to OIDC eliminates the long-lived secret entirely, cryptographically ties each publish to a specific GH Actions run, and adds a provenance attestation that users can verify with `npm audit signatures @xauyxau/hnch`.

The only consumer of `NPM_TOKEN` in the repo is `.github/workflows/release.yml`. Once the binding is set up and the workflow is updated, the token can be revoked with no other changes.

## Decisions

- Trusted publisher binding registered on npmjs.com (one-time manual step on the npm side; no repo change).
- `release.yml` drops the `NPM_TOKEN` env on the semantic-release step and adds `NPM_CONFIG_PROVENANCE: true` so npm attaches a provenance attestation to each publish.
- `id-token: write` permission already on the release job (line 17) — required for OIDC and was wired in earlier work, no change needed.
- Bootstrap `NPM_TOKEN` secret revoked from BOTH npm (token page → revoke) AND GitHub Actions (`gh secret delete NPM_TOKEN`) only AFTER the first OIDC publish proves out. Order matters — keep the token alive as a fallback during the cutover so a misconfigured binding doesn't brick releases.

## Files to touch

- `.github/workflows/release.yml` — single hunk in the `Run semantic-release per package (sequential)` step. Replace the `NPM_TOKEN` env line with `NPM_CONFIG_PROVENANCE: 'true'` and update the surrounding comment.

## Manual steps (xau, on npm side)

1. Sign in to npmjs.com.
2. Navigate to `https://www.npmjs.com/package/@xauyxau/hnch/access`.
3. Click **Trusted Publishers** tab → **Add new trusted publisher**.
4. Fill in:
   - Publisher: **GitHub Actions**
   - Repository owner: `IIxauII`
   - Repository name: `hnch`
   - Workflow filename: `release.yml`
   - Environment name: leave blank
5. Save.

After PR is open and merged + the OIDC publish proves out (one full release-with-publish cycle):

6. Revoke the bootstrap NPM_TOKEN: https://www.npmjs.com/settings/<your-user>/tokens → revoke `hnch-publish` (or whatever the granular token was named).
7. Delete the GH secret: `gh secret delete NPM_TOKEN`.

## Workflow change (sketch)

Current `release.yml` env block:
```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

After:
```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN }}
          # npm Trusted Publishing via OIDC — no NPM_TOKEN secret needed.
          # The npm CLI uses the GH Actions OIDC token (id-token: write
          # permission set on this job) to authenticate against npm. The
          # trusted publisher binding registered on the package's settings
          # page authorises this exact workflow file in IIxauII/hnch to
          # publish @xauyxau/hnch. NPM_CONFIG_PROVENANCE=true makes npm
          # attach a provenance attestation that ties each tarball back
          # to the specific workflow run that built it.
          NPM_CONFIG_PROVENANCE: 'true'
```

No other workflow lines change. `id-token: write` is already at line 17 of `release.yml`.

## Files to read (no changes)

- `.github/workflows/release.yml:17` — confirm `id-token: write` permission present
- `.github/workflows/release.yml:50-65` — current env block on the semantic-release step
- `packages/cli/.releaserc.json` — confirm `@semantic-release/npm` plugin still has `npmPublish: true` (semantic-release picks up provenance automatically when env is set; no plugin config change needed)

## Sequencing — important

To avoid bricking releases, do this in order:

1. **Before** the PR: register the trusted publisher binding on npmjs.com (manual, browser).
2. Open PR with the workflow change. Note in PR description: "Do NOT merge until trusted publisher binding is registered on the package settings page."
3. CI on the PR runs only the build/test matrix (no publish — that's main only), so a misconfigured binding won't surface yet.
4. Merge to main. semantic-release runs. If a new `feat(cli):` / `fix(cli):` commit existed, the npm publish step now uses OIDC.
5. **If publish fails:** the bootstrap NPM_TOKEN is still in the repo secrets — re-add the env line to release.yml, revert + redo. (Keeps the path back open.)
6. **If publish succeeds:** verify `npm audit signatures @xauyxau/hnch` shows provenance, then revoke bootstrap NPM_TOKEN on npm + `gh secret delete NPM_TOKEN`.

If no relay/cli/etc. commit lands on main between merging this PR and revoking the token, OIDC won't actually exercise. To force a smoke test, add a trivial `chore(cli): trigger OIDC publish smoke` commit AFTER the binding+workflow are both in place — but that won't trigger a release because `chore` doesn't match release rules. So: the cleanest smoke is to wait until the next genuine `fix(cli):` or `feat(cli):` lands, OR push a deliberate test bump like `fix(cli): bump for OIDC smoke`. Latter is hacky; suggest just letting the next real fix land.

## Verification

**Pre-merge (local):**
- `yamllint .github/workflows/release.yml` if installed; otherwise eyeball the diff.

**Post-merge (after first cli-scoped commit fires release):**
- GH Actions UI: the semantic-release step should show no `NPM_TOKEN` env var. The npm publish step's log should mention OIDC.
- From any shell: `npm audit signatures @xauyxau/hnch` — must show signature + provenance attestation lines, e.g. `provenance: ✓` and `signature: ✓`.
- `npm view @xauyxau/hnch@<new-version> dist.attestations` should be populated.

**Post-revoke:**
- `gh secret list` — `NPM_TOKEN` no longer present.
- npmjs.com tokens page — `hnch-publish` no longer present.

## Commit shape

Single commit, single PR:

```
ci: switch @xauyxau/hnch publish to npm Trusted Publishing (OIDC)

Drop the long-lived NPM_TOKEN env in favour of OIDC-based auth.
The trusted publisher binding registered on the package's npm
settings page authorises this exact workflow (IIxauII/hnch
release.yml) to publish without a secret. NPM_CONFIG_PROVENANCE=true
attaches a provenance attestation tying each tarball back to the
specific GH Actions run that built it; users can verify with
`npm audit signatures @xauyxau/hnch`.

The bootstrap NPM_TOKEN secret + npm token will be revoked manually
after the first OIDC publish proves out.

Pre-req: trusted publisher binding registered at
https://www.npmjs.com/package/@xauyxau/hnch/access (Trusted
Publishers tab → GitHub Actions → IIxauII/hnch + release.yml).
```

## Out of scope

- Apply the same OIDC flow to `@hnch/relay` / `@hnch/client` / `@hnch/shared` — they're all `private: true` and never publish. No change.
- Standalone binary signing, Sigstore, GitHub artifact attestations beyond what npm provenance already gives. Provenance attestation IS Sigstore-backed via npm; no additional setup needed.
