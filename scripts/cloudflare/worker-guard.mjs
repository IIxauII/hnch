// @ts-check
/**
 * Building blocks for the deploy guards of hnch's Cloudflare Workers
 * (ADR-0051): `packages/relay/scripts/deploy-guard.mjs` (hnch-relay) and
 * `packages/client/scripts/deploy-guard.mjs` (hnch-web). Each package keeps
 * its own CLI and policy and reads its own wrangler.jsonc (wrangler resolves
 * from the package, not from here); this module holds what both share: the
 * route checks, the release-tag versions and the read-only Cloudflare API calls.
 *
 * The API calls use CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 */

const API = 'https://api.cloudflare.com/client/v4';
export const ZONE_HOST = 'hnch.dev';

/**
 * @typedef {{ pattern: string, zone_id?: string, zone_name?: string, custom_domain?: boolean }} RouteConfig
 * @typedef {{ pattern: string, script?: string | null }} LiveRoute
 */

/**
 * Route patterns of a wrangler config.
 * @param {{ routes?: (RouteConfig | string)[] }} config
 * @returns {string[]}
 */
export function routePatterns(config) {
  return (config.routes ?? []).map((r) => (typeof r === 'string' ? r : r.pattern));
}

/**
 * The Worker must be reachable only through its hnch.dev routes.
 * @param {{ workers_dev?: boolean, preview_urls?: boolean }} config
 * @returns {string[]}
 */
export function exposureProblems(config) {
  const problems = [];
  if (config.workers_dev !== false) problems.push('workers_dev must be false');
  if (config.preview_urls !== false) problems.push('preview_urls must be false');
  return problems;
}

/**
 * Every route on hnch.dev, with a non-empty zone_id (the deploy token has no
 * Zone: Read), and a route, not a Custom Domain (whose DNS record Cloudflare
 * owns).
 * @param {string} scope
 * @param {(RouteConfig | string)[]} routes
 * @returns {string[]}
 */
export function routeProblems(scope, routes) {
  const problems = [];
  for (const route of routes) {
    const r = typeof route === 'string' ? { pattern: route } : route;
    if (!r.pattern.startsWith(`${ZONE_HOST}/`))
      problems.push(`${scope}: route ${r.pattern} is not on ${ZONE_HOST}`);
    if (!r.zone_id) problems.push(`${scope}: route ${r.pattern} has no zone_id`);
    if (r.custom_domain) problems.push(`${scope}: route ${r.pattern} is a Custom Domain`);
  }
  return problems;
}

/**
 * Live route patterns of `script` that `configured` would remove.
 * @param {LiveRoute[]} live
 * @param {string[]} configured
 * @param {string} script
 */
export function removedRoutes(live, configured, script) {
  return live
    .filter((r) => r.script === script && !configured.includes(r.pattern))
    .map((r) => r.pattern);
}

/**
 * Configured route patterns that are not live for `script`.
 * @param {LiveRoute[]} live
 * @param {string[]} configured
 * @param {string} script
 */
export function missingRoutes(live, configured, script) {
  return configured.filter((p) => !live.some((r) => r.script === script && r.pattern === p));
}

/**
 * `X.Y.Z` from `<prefix>vX.Y.Z`, `vX.Y.Z` or `X.Y.Z`, as numbers; null otherwise.
 * @param {string | null | undefined} tag
 * @param {string} prefix release-tag prefix, e.g. `relay-`
 * @returns {[number, number, number] | null}
 */
export function parseVersion(tag, prefix) {
  const escaped = prefix.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^(?:${escaped})?v?(\\d+)\\.(\\d+)\\.(\\d+)$`).exec(tag ?? '');
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Whether deploying `next` would go back from `live`.
 * @param {string} next
 * @param {string} live
 * @param {string} prefix
 */
export function isDowngrade(next, live, prefix) {
  const a = parseVersion(next, prefix);
  const b = parseVersion(live, prefix);
  if (a === null || b === null) return false;
  for (let i = 0; i < 3; i++)
    if (a[i] !== b[i]) return /** @type {number} */ (a[i]) < /** @type {number} */ (b[i]);
  return false;
}

/** @param {string[]} problems */
export function fail(problems) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}

// ------------------------------------------------------------- Cloudflare API

/**
 * A Cloudflare API result. Only an explicit success with a result counts; a
 * 404, an error or an unreadable answer fails, so a guard can't pass by not
 * finding what it checks. ("Never deployed" is asked of the script list; see
 * `scriptExists`.)
 * @param {string} path
 */
export async function api(path) {
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = /** @type {{ success?: boolean, result?: any, errors?: unknown[] }} */ (
    await res.json().catch(() => ({}))
  );
  if (!res.ok || body.success !== true || body.result === undefined || body.result === null) {
    throw new Error(`${path}: ${res.status} ${JSON.stringify(body.errors ?? [])}`);
  }
  return body.result;
}

/**
 * A Cloudflare API list; anything but an array fails.
 * @param {string} path
 * @returns {Promise<unknown[]>}
 */
export async function apiList(path) {
  const result = await api(path);
  if (!Array.isArray(result)) throw new Error(`${path}: expected a list`);
  return result;
}

/** @param {string} script */
export function scriptPath(script) {
  const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
  if (!account) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  return `/accounts/${account}/workers/scripts/${script}`;
}

/**
 * @typedef {{ name?: string, type?: string, text?: string }} Binding
 * @typedef {{ tag: string | null, bindings: Binding[] | null }} LiveVersion
 */

/**
 * Whether `script` exists on the account. Asked of the account's script list,
 * so a wrong account or path fails instead of reading as "never deployed".
 * @param {string} script
 */
export async function scriptExists(script) {
  const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
  if (!account) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  const scripts = /** @type {{ id?: string }[]} */ (
    await apiList(`/accounts/${account}/workers/scripts`)
  );
  return scripts.some((s) => s.id === script);
}

/**
 * The versions serving `script` now; empty only when the script doesn't exist
 * (before the first deploy).
 * @param {string} script
 * @returns {Promise<LiveVersion[]>}
 */
export async function liveVersions(script) {
  if (!(await scriptExists(script))) return [];
  const base = scriptPath(script);
  const deployments = await api(`${base}/deployments`);
  if (!Array.isArray(deployments.deployments))
    throw new Error(`${base}/deployments: expected a list`);
  const latest = deployments.deployments[0];
  if (!latest) return [];
  if (!Array.isArray(latest.versions)) throw new Error(`${base}/deployments: no versions`);
  /** @type {LiveVersion[]} */
  const versions = [];
  for (const { version_id: id } of latest.versions) {
    const version = await api(`${base}/versions/${id}`);
    const tag = version.annotations?.['workers/tag'];
    const bindings = version.resources?.bindings;
    versions.push({
      tag: typeof tag === 'string' ? tag : null,
      bindings: Array.isArray(bindings) ? bindings : null,
    });
  }
  return versions;
}

/**
 * Zone ids of a config's routes.
 * @param {{ routes?: (RouteConfig | string)[] }} config
 * @returns {Set<string>}
 */
export function routeZones(config) {
  return new Set(
    (config.routes ?? []).flatMap((r) => (typeof r === 'string' || !r.zone_id ? [] : [r.zone_id])),
  );
}

/**
 * The live Workers routes of every zone the config routes into. Fails when no
 * route names a zone, since there would be nothing to compare.
 * @param {{ routes?: (RouteConfig | string)[] }} config
 * @returns {Promise<LiveRoute[]>}
 */
export async function liveRoutes(config) {
  const zones = routeZones(config);
  if (zones.size === 0)
    throw new Error('no route names a zone_id, so live routes cannot be checked');
  /** @type {LiveRoute[]} */
  const routes = [];
  for (const zone of zones) {
    routes.push(.../** @type {LiveRoute[]} */ (await apiList(`/zones/${zone}/workers/routes`)));
  }
  return routes;
}

/**
 * `wrangler deploy` deletes the Worker's routes that are missing from its
 * config. Refuses that unless `allowRemoval` (a manual dispatch with
 * `allow_route_removal`), in which case it only warns.
 * @param {{ routes?: (RouteConfig | string)[] }} config
 * @param {string} script
 * @param {boolean} allowRemoval
 * @returns {Promise<string[]>}
 */
export async function routeRemovalProblems(config, script, allowRemoval) {
  const removed = removedRoutes(await liveRoutes(config), routePatterns(config), script);
  if (removed.length === 0) return [];
  if (!allowRemoval) {
    return [
      `deploy would remove live route(s) ${removed.join(', ')}; re-run with allow_route_removal if intended`,
    ];
  }
  console.log(`::warning::removing live route(s) ${removed.join(', ')} (allow_route_removal)`);
  return [];
}
