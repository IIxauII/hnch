#!/usr/bin/env node
// @ts-check
/**
 * Checks around `wrangler deploy` of hnch-relay, run by deploy-relay.yml.
 *
 *   node scripts/deploy-guard.mjs config   wrangler.jsonc is a production config
 *   node scripts/deploy-guard.mjs live     the deploy would not remove a live
 *                                          route, nor go back to an older version
 *   node scripts/deploy-guard.mjs verify   the live deployment is this version
 *
 * `live` and `verify` read the Cloudflare API with CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID. ALLOW_ROUTE_REMOVAL=true lets `live` pass a removed
 * route (a manual dispatch with `allow_route_removal`). Code rollback is
 * `wrangler rollback`, never a re-dispatch of an old tag: `live` refuses it.
 *
 * The route, version and API helpers are shared with hnch-web's guard:
 * scripts/cloudflare/worker-guard.mjs at the repo root.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  apiList,
  exposureProblems,
  fail,
  isDowngrade as isDowngradeFrom,
  liveVersions,
  parseVersion as parseVersionWith,
  routePatterns,
  routeProblems,
  routeRemovalProblems,
  scriptExists,
  scriptPath,
} from '../../../scripts/cloudflare/worker-guard.mjs';

export {
  api,
  apiList,
  liveVersions,
  removedRoutes,
  scriptExists,
  ZONE_HOST,
} from '../../../scripts/cloudflare/worker-guard.mjs';

const relayDir = resolve(import.meta.dirname, '..');
const TAG_PREFIX = 'relay-';
export const TEST_VARS = ['HNCH_ENABLE_TEST_ROUTES', 'HNCH_ROOM_CAP'];

/**
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').RouteConfig} RouteConfig
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').Binding} Binding
 * @typedef {{
 *   name?: string,
 *   vars?: Record<string, unknown>,
 *   routes?: (RouteConfig | string)[],
 *   workers_dev?: boolean,
 *   preview_urls?: boolean,
 *   keep_vars?: boolean,
 *   observability?: { logs?: { invocation_logs?: boolean }, traces?: { enabled?: boolean } },
 *   env?: Record<string, { vars?: Record<string, unknown>, routes?: (RouteConfig | string)[] }>,
 * }} DeployConfig
 */

/**
 * Problems that make `config` unfit for production; empty when fit.
 * @param {DeployConfig} config
 * @returns {string[]}
 */
export function configProblems(config) {
  // Only the hnch.dev routes reach the Worker.
  const problems = exposureProblems(config);
  // Dashboard vars kept across deploys could carry the ADR-0027 test vars.
  if (config.keep_vars === true) problems.push('keep_vars must not be set');
  // WebSocket URLs carry `?pw=`: never record request URLs.
  if (config.observability?.logs?.invocation_logs !== false) {
    problems.push('observability.logs.invocation_logs must be false');
  }
  if (config.observability?.traces?.enabled === true) {
    problems.push('observability.traces must be off');
  }
  const scopes = [['top level', config], ...Object.entries(config.env ?? {})];
  for (const [scope, { vars = {}, routes = [] }] of /** @type {[string, DeployConfig][]} */ (
    scopes
  )) {
    for (const name of TEST_VARS) {
      if (name in vars) problems.push(`${scope}: ADR-0027 test var ${name} must not be deployed`);
    }
    if (scope === 'top level') {
      if (vars['JURISDICTION'] !== 'eu') {
        problems.push(
          `${scope}: JURISDICTION must be "eu", is ${JSON.stringify(vars['JURISDICTION'])}`,
        );
      }
      if (routes.length === 0) problems.push(`${scope}: no routes`);
    } else if ('JURISDICTION' in vars && vars['JURISDICTION'] === 'none') {
      problems.push(`${scope}: JURISDICTION "none" must not be deployed`);
    }
    problems.push(...routeProblems(scope, routes));
  }
  return problems;
}

/**
 * `X.Y.Z` from `relay-vX.Y.Z`, `vX.Y.Z` or `X.Y.Z`, as numbers; null otherwise.
 * @param {string | null | undefined} tag
 */
export function parseVersion(tag) {
  return parseVersionWith(tag, TAG_PREFIX);
}

/**
 * Whether deploying `next` would go back from `live`.
 * @param {string} next
 * @param {string} live
 */
export function isDowngrade(next, live) {
  return isDowngradeFrom(next, live, TAG_PREFIX);
}

// ------------------------------------------------------------------ CLI

async function readDeployConfig() {
  const { unstable_readConfig } = await import('wrangler');
  return /** @type {DeployConfig} */ (
    unstable_readConfig({ config: resolve(relayDir, 'wrangler.jsonc') })
  );
}

function packageVersion() {
  return /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(resolve(relayDir, 'package.json'), 'utf8'))
  ).version;
}

/**
 * Problems with what a deployed version actually runs with: the ADR-0027 test
 * vars as a var or a secret, or a jurisdiction other than "eu".
 * @param {Binding[]} bindings
 * @param {string[]} secretNames
 * @returns {string[]}
 */
export function deployedProblems(bindings, secretNames) {
  const problems = [];
  for (const name of TEST_VARS) {
    if (bindings.some((b) => b.name === name)) problems.push(`deployed binding ${name}`);
    if (secretNames.includes(name)) problems.push(`deployed secret ${name}`);
  }
  if (secretNames.includes('JURISDICTION')) problems.push('JURISDICTION is a secret');
  const jurisdiction = bindings.find((b) => b.name === 'JURISDICTION');
  if (jurisdiction?.text !== 'eu') {
    problems.push(`deployed JURISDICTION is ${JSON.stringify(jurisdiction?.text)}, expected "eu"`);
  }
  return problems;
}

async function main() {
  const mode = process.argv[2];
  const config = await readDeployConfig();
  const script = config.name ?? 'hnch-relay';
  const version = packageVersion();

  if (mode === 'config') {
    const problems = configProblems(config);
    if (problems.length > 0) fail(problems);
    console.log(`config ok: ${script} ${version}, routes ${routePatterns(config).join(', ')}`);
    return;
  }

  if (mode === 'live') {
    const problems = await routeRemovalProblems(
      config,
      script,
      process.env['ALLOW_ROUTE_REMOVAL'] === 'true',
    );
    // Secrets outlive deploys: one named like a test var would ride along.
    const exists = await scriptExists(script);
    const secrets = new Set(
      /** @type {{ name?: string }[]} */ (
        exists ? await apiList(`${scriptPath(script)}/secrets`) : []
      ).flatMap((s) => (typeof s.name === 'string' ? [s.name] : [])),
    );
    for (const name of [...TEST_VARS, 'JURISDICTION']) {
      if (secrets.has(name)) problems.push(`secret ${name} is set on ${script}; delete it`);
    }
    const live = await liveVersions(script, exists);
    // An untagged live version can't be compared, so it can't be shown older.
    if (live.some((v) => v.tag === null)) {
      problems.push(
        `a live version of ${script} has no relay-v tag, so this deploy can't be shown newer; tag or roll back to a released version first`,
      );
    }
    const tags = live.flatMap((v) => (v.tag === null ? [] : [v.tag]));
    for (const tag of tags) {
      if (isDowngrade(version, tag)) {
        problems.push(
          `live version is ${tag}, newer than ${version}: roll back with \`wrangler rollback\`, not an old tag`,
        );
      }
    }
    if (problems.length > 0) fail(problems);
    console.log(`live ok: deploying ${version} over ${tags.join(', ') || 'nothing'}`);
    return;
  }

  if (mode === 'verify') {
    const live = await liveVersions(script);
    const tags = live.map((v) => v.tag ?? 'untagged');
    if (!tags.includes(`relay-v${version}`)) {
      fail([`live deployment is ${tags.join(', ') || 'nothing'}, expected relay-v${version}`]);
    }
    const secrets = /** @type {{ name?: string }[]} */ (
      await apiList(`${scriptPath(script)}/secrets`)
    ).flatMap((s) => (typeof s.name === 'string' ? [s.name] : []));
    const problems = [];
    for (const { tag, bindings } of live) {
      if (bindings === null) {
        problems.push(`${tag ?? 'untagged'}: could not read the deployed bindings`);
        continue;
      }
      problems.push(
        ...deployedProblems(bindings, secrets).map((p) => `${tag ?? 'untagged'}: ${p}`),
      );
    }
    if (problems.length > 0) fail(problems);
    console.log(`deployed: ${tags.join(', ')}; bindings and secrets ok`);
    return;
  }

  console.error('usage: node scripts/deploy-guard.mjs config|live|verify');
  process.exit(2);
}

// A thrown API or config error (no zoned route, an unreadable answer) is
// reported like any other problem.
if (process.argv[1] === import.meta.filename) {
  await main().catch((/** @type {unknown} */ err) =>
    fail([err instanceof Error ? err.message : String(err)]),
  );
}
