#!/usr/bin/env node
// @ts-check
/**
 * Checks around `wrangler deploy` of hnch-web, run by deploy-client.yml.
 *
 *   node scripts/deploy-guard.mjs config   wrangler.jsonc is a production config
 *   node scripts/deploy-guard.mjs www      the build in www is fit to deploy:
 *                                          _headers at its root, every .js and
 *                                          .css content-hashed
 *   node scripts/deploy-guard.mjs live     the deploy would not remove a live route
 *   node scripts/deploy-guard.mjs verify   the version this run uploaded is the
 *                                          live one, and every configured route
 *                                          is live
 *
 * `live` and `verify` read the Cloudflare API with CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID. ALLOW_ROUTE_REMOVAL=true lets `live` pass a removed
 * route (a manual dispatch with `allow_route_removal`).
 *
 * `verify` takes the version id from the ND-JSON that `wrangler deploy` wrote
 * to WRANGLER_OUTPUT_FILE_PATH, the deployed commit from DEPLOY_SHA (the
 * version message must name it) and, for a release commit, the release tag
 * from DEPLOY_TAG (empty for an unreleased commit, which is deployed untagged).
 *
 * The route, version and API helpers are shared with hnch-relay's guard:
 * scripts/cloudflare/worker-guard.mjs at the repo root.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { normalize, relative, resolve } from 'node:path';
import {
  exposureProblems,
  fail,
  liveRoutes,
  liveVersions,
  missingRoutes,
  routePatterns,
  routeProblems,
  routeRemovalProblems,
  routeZones,
} from '../../../scripts/cloudflare/worker-guard.mjs';

const clientDir = resolve(import.meta.dirname, '..');
export const SCRIPT = 'hnch-web';

/**
 * `_headers` gives `/*.js` and `/*.css` a year of `immutable`, so every one of
 * them must carry a content hash (Angular `outputHashing: all`). Matches the
 * webpack browser builder's `<name>.<hash>.js|css` form only, with the
 * Caddyfile's charset.
 */
export const HASHED = /\.[A-Za-z0-9]{8,}\.(js|css)$/;

/**
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').RouteConfig} RouteConfig
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').LiveVersion} LiveVersion
 * @typedef {{
 *   name?: string,
 *   main?: string,
 *   routes?: (RouteConfig | string)[],
 *   workers_dev?: boolean,
 *   preview_urls?: boolean,
 *   assets?: {
 *     directory?: string,
 *     binding?: string,
 *     not_found_handling?: string,
 *     run_worker_first?: boolean | string[],
 *   },
 * }} DeployConfig
 */

/**
 * Problems that make `config` unfit for production; empty when fit.
 * @param {DeployConfig} config
 * @returns {string[]}
 */
export function configProblems(config) {
  const problems = [];
  // The route guard and verify look the Worker up by this name.
  if (config.name !== SCRIPT) {
    problems.push(`name must be ${SCRIPT}, is ${JSON.stringify(config.name)}`);
  }
  // Only the hnch.dev route reaches the Worker.
  problems.push(...exposureProblems(config));
  // Assets-only: no Worker code runs, so asset requests are not billed as
  // Worker requests (ADR-0051).
  if (config.main !== undefined) problems.push('main must not be set (assets-only Worker)');
  const assets = config.assets;
  if (assets === undefined) {
    problems.push('assets must be set');
  } else {
    if (normalize(assets.directory ?? '').replace(/\/+$/, '') !== 'www') {
      problems.push(`assets.directory must be ./www, is ${JSON.stringify(assets.directory)}`);
    }
    if (assets.not_found_handling !== 'single-page-application') {
      problems.push('assets.not_found_handling must be "single-page-application"');
    }
    if (assets.run_worker_first !== undefined && assets.run_worker_first !== false) {
      problems.push('assets.run_worker_first must not be set');
    }
    if (assets.binding !== undefined) problems.push('assets.binding must not be set');
  }
  const routes = config.routes ?? [];
  if (routes.length === 0) problems.push('top level: no routes');
  problems.push(...routeProblems('top level', routes));
  return problems;
}

/**
 * Every file under `dir`, as paths relative to it.
 * @param {string} dir
 * @returns {string[]}
 */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, resolve(e.parentPath, e.name)))
    .toSorted();
}

/**
 * Problems that make the build in `wwwDir` unfit to deploy; empty when fit.
 * @param {string} wwwDir
 * @param {string} headersSource the `_headers` the build must carry
 * @returns {string[]}
 */
export function wwwProblems(wwwDir, headersSource) {
  if (!existsSync(resolve(wwwDir, 'index.html'))) return [`${wwwDir} has no index.html`];
  const problems = [];
  const headers = resolve(wwwDir, '_headers');
  if (!existsSync(headers)) {
    problems.push(`${wwwDir} has no _headers at its root`);
  } else if (readFileSync(headers, 'utf8') !== readFileSync(headersSource, 'utf8')) {
    problems.push(`${wwwDir}/_headers differs from ${headersSource}`);
  }
  for (const file of filesUnder(wwwDir)) {
    if (/\.(js|css)$/.test(file) && !HASHED.test(file)) {
      problems.push(`${file} is not content-hashed but _headers serves it as immutable`);
    }
  }
  return problems;
}

/**
 * The version id of the last deploy recorded in wrangler's ND-JSON output
 * file; null if there is none.
 * @param {string} ndjson
 * @returns {string | null}
 */
export function deployedVersionId(ndjson) {
  let id = null;
  for (const line of ndjson.split('\n')) {
    if (line.trim() === '') continue;
    const entry = JSON.parse(line);
    if (entry?.type === 'deploy' && typeof entry.version_id === 'string') id = entry.version_id;
  }
  return id;
}

/**
 * Problems that show this run's upload is not what serves: `versionId` must be
 * live at 100 %, its message must name `sha`, and it must carry `tag` (a
 * release commit) or no tag at all (an unreleased one).
 * @param {LiveVersion[]} live
 * @param {{ versionId: string, sha: string, tag: string }} expected
 * @returns {string[]}
 */
export function deployedVersionProblems(live, { versionId, sha, tag }) {
  const ids = live.map((v) => `${v.id} (${v.percentage ?? '?'} %)`).join(', ') || 'nothing';
  const version = live.find((v) => v.id.toLowerCase() === versionId.toLowerCase());
  if (version === undefined) return [`version ${versionId} is not live; live: ${ids}`];
  const problems = [];
  if (version.percentage !== 100)
    problems.push(`version ${versionId} is not at 100 %; live: ${ids}`);
  if (!version.message?.includes(sha)) {
    problems.push(`version ${versionId} message ${JSON.stringify(version.message)} lacks ${sha}`);
  }
  if ((version.tag ?? '') !== tag) {
    problems.push(
      `version ${versionId} is tagged ${JSON.stringify(version.tag)}, expected ${JSON.stringify(tag || null)}`,
    );
  }
  return problems;
}

// ------------------------------------------------------------------ CLI

async function readDeployConfig() {
  const { unstable_readConfig } = await import('wrangler');
  return /** @type {DeployConfig} */ (
    unstable_readConfig({ config: resolve(clientDir, 'wrangler.jsonc') })
  );
}

/** @param {string} name */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) fail([`${name} is not set`]);
  return /** @type {string} */ (value);
}

async function main() {
  const mode = process.argv[2];

  if (mode === 'www') {
    const wwwDir = resolve(clientDir, 'www');
    const problems = wwwProblems(wwwDir, resolve(clientDir, 'src/_headers'));
    if (problems.length > 0) fail(problems);
    const assets = filesUnder(wwwDir).filter((f) => /\.(js|css)$/.test(f)).length;
    console.log(`www ok: _headers in place, ${assets} .js/.css files, all content-hashed`);
    return;
  }

  if (mode !== 'config' && mode !== 'live' && mode !== 'verify') {
    console.error('usage: node scripts/deploy-guard.mjs config|www|live|verify');
    process.exit(2);
  }

  const config = await readDeployConfig();

  if (mode === 'config') {
    const problems = configProblems(config);
    if (problems.length > 0) fail(problems);
    console.log(`config ok: ${SCRIPT}, routes ${routePatterns(config).join(', ')}`);
    return;
  }

  if (routeZones(config).size === 0) fail(['no route with a zone_id: nothing to check']);

  if (mode === 'live') {
    const problems = await routeRemovalProblems(
      config,
      SCRIPT,
      process.env['ALLOW_ROUTE_REMOVAL'] === 'true',
    );
    if (problems.length > 0) fail(problems);
    console.log(`live ok: no live ${SCRIPT} route removed`);
    return;
  }

  const outputFile = requiredEnv('WRANGLER_OUTPUT_FILE_PATH');
  const versionId = existsSync(outputFile)
    ? deployedVersionId(readFileSync(outputFile, 'utf8'))
    : null;
  if (versionId === null) fail([`no deploy version id in ${outputFile}`]);
  const expected = {
    versionId: /** @type {string} */ (versionId),
    sha: requiredEnv('DEPLOY_SHA'),
    tag: process.env['DEPLOY_TAG'] ?? '',
  };
  const problems = deployedVersionProblems(await liveVersions(SCRIPT), expected);
  const missing = missingRoutes(await liveRoutes(config), routePatterns(config), SCRIPT);
  if (missing.length > 0) problems.push(`route(s) ${missing.join(', ')} not live for ${SCRIPT}`);
  if (problems.length > 0) fail(problems);
  console.log(
    `deployed: ${expected.versionId} (${expected.tag || 'untagged'}, ${expected.sha}); routes ${routePatterns(config).join(', ')} live`,
  );
}

if (process.argv[1] === import.meta.filename) await main();
