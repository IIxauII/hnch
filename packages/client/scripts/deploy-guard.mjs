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
 *   node scripts/deploy-guard.mjs verify   the live deployment is this version and
 *                                          every configured route is live
 *
 * `live` and `verify` read the Cloudflare API with CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID. ALLOW_ROUTE_REMOVAL=true lets `live` pass a removed
 * route (a manual dispatch with `allow_route_removal`).
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

/**
 * `_headers` gives `/*.js` and `/*.css` a year of `immutable`, so every one of
 * them must carry a content hash (Angular `outputHashing: all`). Same charset
 * as the Caddyfile, for esbuild's base32 hashes.
 */
export const HASHED = /\.[A-Za-z0-9]{8,}\.(js|css)$/;

/**
 * @typedef {import('../../../scripts/cloudflare/worker-guard.mjs').RouteConfig} RouteConfig
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
  // Only the hnch.dev route reaches the Worker.
  const problems = exposureProblems(config);
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

// ------------------------------------------------------------------ CLI

async function readDeployConfig() {
  const { unstable_readConfig } = await import('wrangler');
  return /** @type {DeployConfig} */ (
    unstable_readConfig({ config: resolve(clientDir, 'wrangler.jsonc') })
  );
}

function packageVersion() {
  return /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(resolve(clientDir, 'package.json'), 'utf8'))
  ).version;
}

async function main() {
  const mode = process.argv[2];
  const config = await readDeployConfig();
  const script = config.name ?? 'hnch-web';
  const version = packageVersion();

  if (mode === 'config') {
    const problems = configProblems(config);
    if (problems.length > 0) fail(problems);
    console.log(`config ok: ${script} ${version}, routes ${routePatterns(config).join(', ')}`);
    return;
  }

  if (mode === 'www') {
    const wwwDir = resolve(clientDir, 'www');
    const problems = wwwProblems(wwwDir, resolve(clientDir, 'src/_headers'));
    if (problems.length > 0) fail(problems);
    const assets = filesUnder(wwwDir).filter((f) => /\.(js|css)$/.test(f)).length;
    console.log(`www ok: _headers in place, ${assets} .js/.css files, all content-hashed`);
    return;
  }

  if (mode === 'live') {
    const problems = await routeRemovalProblems(
      config,
      script,
      process.env['ALLOW_ROUTE_REMOVAL'] === 'true',
    );
    if (problems.length > 0) fail(problems);
    const tags = (await liveVersions(script)).flatMap((v) => (v.tag === null ? [] : [v.tag]));
    console.log(`live ok: deploying ${version} over ${tags.join(', ') || 'nothing'}`);
    return;
  }

  if (mode === 'verify') {
    const tags = (await liveVersions(script)).map((v) => v.tag ?? 'untagged');
    const problems = [];
    if (!tags.includes(`client-v${version}`)) {
      problems.push(
        `live deployment is ${tags.join(', ') || 'nothing'}, expected client-v${version}`,
      );
    }
    const missing = missingRoutes(await liveRoutes(config), routePatterns(config), script);
    if (missing.length > 0) problems.push(`route(s) ${missing.join(', ')} not live for ${script}`);
    if (problems.length > 0) fail(problems);
    console.log(`deployed: ${tags.join(', ')}; routes ${routePatterns(config).join(', ')} live`);
    return;
  }

  console.error('usage: node scripts/deploy-guard.mjs config|www|live|verify');
  process.exit(2);
}

if (process.argv[1] === import.meta.filename) await main();
