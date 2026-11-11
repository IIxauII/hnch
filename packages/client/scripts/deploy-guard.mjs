#!/usr/bin/env node
// @ts-check
/**
 * Checks around `wrangler deploy` of hnch-web, run by deploy-client.yml.
 *
 *   node scripts/deploy-guard.mjs config   wrangler.jsonc is a production config
 *   node scripts/deploy-guard.mjs www      the build in www is fit to deploy:
 *                                          ROOT_FILES at its root, every .js
 *                                          and .css content-hashed
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
} from '../../../scripts/cloudflare/worker-guard.mjs';

const clientDir = resolve(import.meta.dirname, '..');
export const SCRIPT = 'hnch-web';

/**
 * `_headers` gives `/*.js` and `/*.css` a year of `immutable`, so every one of
 * them must carry a content hash (Angular `outputHashing: all`). Matches
 * exactly the webpack browser builder's `<name>.<16 lowercase hex>.js|css`, so
 * a different hash form fails the deploy instead of slipping through.
 */
export const HASHED = /\.[0-9a-f]{16}\.(js|css)$/;

/** The Worker's entry, relative to this package (ADR-0058). */
export const WORKER_MAIN = 'worker/index.ts';

/**
 * The only `run_worker_first` a deploy accepts: every path without a dot (the
 * pages) runs the Worker, every file is served as an asset without it. A wider
 * list, or `true`, would bill each script, style and image request as a Worker
 * request against the account's daily Free-plan budget (ADR-0051).
 */
export const WORKER_FIRST = ['/*', '!/*.*'];

/**
 * Files angular.json copies from src to the root of www, which the build must
 * carry unchanged: `_headers` configures hnch-web's caching, without
 * `robots.txt` or `sitemap.xml` crawlers get the SPA's index.html, and without
 * `index.md` Markdown requests quietly get the HTML (worker/index.ts).
 * `.well-known/api-catalog` (RFC 9727) and the `openapi.json` it links to
 * would otherwise also answer the SPA's index.html, which agents read as no
 * API.
 */
export const ROOT_FILES = [
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'index.md',
  'openapi.json',
  '.well-known/api-catalog',
];

/**
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').RouteConfig} RouteConfig
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').LiveVersion} LiveVersion
 * @typedef {{
 *   name?: string,
 *   main?: string,
 *   routes?: (RouteConfig | string)[],
 *   workers_dev?: boolean,
 *   preview_urls?: boolean,
 *   observability?: {
 *     enabled?: boolean,
 *     logs?: { enabled?: boolean },
 *     traces?: { enabled?: boolean },
 *   },
 *   logpush?: boolean,
 *   tail_consumers?: unknown[],
 *   streaming_tail_consumers?: unknown[],
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
  // The Markdown Worker, and only it (wrangler resolves `main` to an absolute
  // path, a test fixture passes it relative).
  const entry =
    config.main === undefined ? undefined : relative(clientDir, resolve(clientDir, config.main));
  if (entry !== WORKER_MAIN) {
    problems.push(`main must be ${WORKER_MAIN}, is ${JSON.stringify(config.main)}`);
  }
  // Page URLs carry room codes; nothing may record them.
  const observability = config.observability;
  if (
    observability?.enabled !== false ||
    observability.logs?.enabled === true ||
    observability.traces?.enabled === true
  ) {
    problems.push('observability.enabled must be false, with no logs or traces override');
  }
  if (config.logpush === true) problems.push('logpush must not be set');
  for (const sink of /** @type {const} */ (['tail_consumers', 'streaming_tail_consumers'])) {
    if ((config[sink] ?? []).length > 0) problems.push(`${sink} must not be set`);
  }
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
    if (JSON.stringify(assets.run_worker_first) !== JSON.stringify(WORKER_FIRST)) {
      problems.push(
        `assets.run_worker_first must be ${JSON.stringify(WORKER_FIRST)}, is ${JSON.stringify(assets.run_worker_first)}`,
      );
    }
    // worker/index.ts reads the assets as env.ASSETS.
    if (assets.binding !== 'ASSETS') problems.push('assets.binding must be "ASSETS"');
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
 * Problems that make the build in `wwwDir` unfit to deploy (empty when fit),
 * and how many .js/.css files it has, from one walk of the tree.
 * @param {string} wwwDir
 * @param {string} srcDir the src the build came from, holding the ROOT_FILES
 * @returns {{ problems: string[], assets: number }}
 */
export function wwwReport(wwwDir, srcDir) {
  if (!existsSync(resolve(wwwDir, 'index.html'))) {
    return { problems: [`${wwwDir} has no index.html`], assets: 0 };
  }
  const problems = [];
  for (const name of ROOT_FILES) {
    const built = resolve(wwwDir, name);
    const source = resolve(srcDir, name);
    if (!existsSync(built)) {
      problems.push(`${wwwDir} has no ${name} at its root`);
    } else if (readFileSync(built, 'utf8') !== readFileSync(source, 'utf8')) {
      problems.push(`${wwwDir}/${name} differs from ${source}`);
    }
  }
  const assets = filesUnder(wwwDir).filter((f) => /\.(js|css)$/.test(f));
  for (const file of assets) {
    if (!HASHED.test(file)) {
      problems.push(`${file} is not content-hashed but _headers serves it as immutable`);
    }
  }
  return { problems, assets: assets.length };
}

/**
 * Problems that make the build in `wwwDir` unfit to deploy; empty when fit.
 * @param {string} wwwDir
 * @param {string} srcDir
 */
export function wwwProblems(wwwDir, srcDir) {
  return wwwReport(wwwDir, srcDir).problems;
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
    const { problems, assets } = wwwReport(wwwDir, resolve(clientDir, 'src'));
    if (problems.length > 0) fail(problems);
    console.log(
      `www ok: ${ROOT_FILES.join(', ')} in place, ${assets} .js/.css files, all content-hashed`,
    );
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
  const [versions, routes] = await Promise.all([liveVersions(SCRIPT), liveRoutes(config)]);
  const problems = deployedVersionProblems(versions, expected);
  const missing = missingRoutes(routes, routePatterns(config), SCRIPT);
  if (missing.length > 0) problems.push(`route(s) ${missing.join(', ')} not live for ${SCRIPT}`);
  if (problems.length > 0) fail(problems);
  console.log(
    `deployed: ${expected.versionId} (${expected.tag || 'untagged'}, ${expected.sha}); routes ${routePatterns(config).join(', ')} live`,
  );
}

// A thrown API or config error (no zoned route, an unreadable answer) is
// reported like any other problem.
if (process.argv[1] === import.meta.filename) {
  await main().catch((/** @type {unknown} */ err) =>
    fail([err instanceof Error ? err.message : String(err)]),
  );
}
