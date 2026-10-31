#!/usr/bin/env node
// Maps the files a CI run changed to the lanes it must run. Called by the
// detect-changes job in .github/workflows/ci.yml, which works out the base
// and the changed-file list; this script owns only the path rules.
//
//   node scripts/ci/changed-lanes.mjs < changed.txt >> "$GITHUB_OUTPUT"
//   node scripts/ci/changed-lanes.mjs --all >> "$GITHUB_OUTPUT"
//   node scripts/ci/changed-lanes.mjs --none >> "$GITHUB_OUTPUT"
//
// stdin is one path per line. stdout is the job's outputs as key=value lines;
// the reasoning goes to stderr so it shows in the job log.
//
// Pure Node, no dependencies: detect-changes does not install node_modules.
import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

/**
 * Every package with a verify lane, in matrix order. e2e has none: the e2e
 * job runs that package's typecheck, format check and lint before Playwright,
 * so the `e2e` output alone decides whether it runs.
 */
export const PACKAGES = ['shared', 'relay', 'client', 'cli'];

// Root files force the full pipeline.
const ROOT = /^(pnpm-lock\.yaml|package\.json|tsconfig.*\.json|\.github\/workflows\/)/;

// Markdown and the LICENSE text at a package's top level (README, CHANGELOG,
// CLAUDE.md, LICENSE) are read by no build, test or runtime path, so they start
// no lane. Nested Markdown still counts: a package could bundle or import it
// from its tree.
const PACKAGE_DOCS = /^packages\/[^/]+\/([^/]+\.md|LICENSE)$/;

/**
 * @param {string[]} files changed paths, repo-relative
 * @returns {{
 *   lanes: Record<'shared'|'relay'|'client'|'cli'|'e2e'|'root', boolean>,
 *   verifyPackages: string[],
 *   ignored: string[],
 * }}
 */
export function changedLanes(files) {
  const ignored = files.filter((f) => PACKAGE_DOCS.test(f));
  const counted = files.filter((f) => f !== '' && !PACKAGE_DOCS.test(f));
  const match = (re) => counted.some((f) => re.test(f));

  const lanes = {
    shared: match(/^packages\/shared\//),
    relay: match(/^packages\/relay\//),
    client: match(/^packages\/client\//),
    cli: match(/^packages\/cli\//),
    e2e: match(/^packages\/e2e\//),
    root: match(ROOT),
  };
  // The relay and client deploy guards (and their tests) share
  // scripts/cloudflare/.
  if (match(/^scripts\/cloudflare\//)) {
    lanes.relay = true;
    lanes.client = true;
  }
  // The relay lane runs its tests under this script (#568).
  if (match(/^scripts\/ci\/with-stall-sampler\.sh$/)) lanes.relay = true;

  // Reverse-deps: a shared change fans into all consumers.
  if (lanes.shared) {
    lanes.relay = lanes.client = lanes.cli = lanes.e2e = true;
  }
  // A relay change re-runs the CLI and shared suites, which test against the
  // relay through the @hnch/relay/testing harness. After the shared block so
  // it does not fan out to client/e2e via shared.
  if (lanes.relay) lanes.cli = lanes.shared = true;
  // A client or relay change requires e2e.
  if (lanes.client || lanes.relay) lanes.e2e = true;
  if (lanes.root) {
    for (const p of PACKAGES) lanes[p] = true;
    lanes.e2e = true;
  }

  return { lanes, verifyPackages: PACKAGES.filter((p) => lanes[p]), ignored };
}

/** Every lane on: the detect-changes fallback when no usable diff exists. */
export function allLanes() {
  return changedLanes(['package.json']);
}

/**
 * Every lane off: a main push run verified by a green PR run for the same
 * tree (ADR-0055, scripts/ci/verified-tree.mjs).
 */
export function noLanes() {
  return changedLanes([]);
}

/**
 * The job outputs as GITHUB_OUTPUT lines. verify-packages is always emitted:
 * the verify matrix fromJSON()s it and fails to expand on an empty string.
 */
export function formatOutputs({ lanes, verifyPackages }) {
  const lines = Object.entries(lanes).map(([k, v]) => `${k}=${v}`);
  lines.push(`verify-packages=${JSON.stringify(verifyPackages)}`);
  return `${lines.join('\n')}\n`;
}

if (argv[1] === import.meta.filename) {
  let result;
  if (argv[2] === '--all') {
    result = allLanes();
  } else if (argv[2] === '--none') {
    result = noLanes();
  } else if (argv.length > 2) {
    stderr.write(`usage: changed-lanes.mjs [--all | --none] < changed-paths\n`);
    exit(2);
  } else {
    result = changedLanes(readFileSync(0, 'utf8').split('\n'));
    for (const f of result.ignored) stderr.write(`Ignored (package docs): ${f}\n`);
  }
  stderr.write(`Verify lanes: ${result.verifyPackages.join(', ') || 'none'}\n`);
  stderr.write(`e2e: ${result.lanes.e2e}\n`);
  stdout.write(formatOutputs(result));
}
