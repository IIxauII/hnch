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
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const relayDir = resolve(import.meta.dirname, '..');
const API = 'https://api.cloudflare.com/client/v4';
export const TEST_VARS = ['HNCH_ENABLE_TEST_ROUTES', 'HNCH_ROOM_CAP'];
export const ZONE_HOST = 'hnch.dev';

/**
 * @typedef {{ pattern: string, zone_id?: string, zone_name?: string, custom_domain?: boolean }} RouteConfig
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
  const problems = [];
  // Only the hnch.dev routes reach the Worker.
  if (config.workers_dev !== false) problems.push('workers_dev must be false');
  if (config.preview_urls !== false) problems.push('preview_urls must be false');
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
    for (const route of routes) {
      const r = typeof route === 'string' ? { pattern: route } : route;
      if (!r.pattern.startsWith(`${ZONE_HOST}/`))
        problems.push(`${scope}: route ${r.pattern} is not on ${ZONE_HOST}`);
      if (r.zone_id === undefined) problems.push(`${scope}: route ${r.pattern} has no zone_id`);
      if (r.custom_domain) problems.push(`${scope}: route ${r.pattern} is a Custom Domain`);
    }
  }
  return problems;
}

/**
 * Live route patterns of `script` that `configured` would remove.
 * @param {{ pattern: string, script?: string | null }[]} liveRoutes
 * @param {string[]} configured
 * @param {string} script
 */
export function removedRoutes(liveRoutes, configured, script) {
  return liveRoutes
    .filter((r) => r.script === script && !configured.includes(r.pattern))
    .map((r) => r.pattern);
}

/**
 * `X.Y.Z` from `relay-vX.Y.Z`, `vX.Y.Z` or `X.Y.Z`, as numbers; null otherwise.
 * @param {string | null | undefined} tag
 * @returns {[number, number, number] | null}
 */
export function parseVersion(tag) {
  const m = /^(?:relay-)?v?(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? '');
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Whether deploying `next` would go back from `live`.
 * @param {string} next
 * @param {string} live
 */
export function isDowngrade(next, live) {
  const a = parseVersion(next);
  const b = parseVersion(live);
  if (a === null || b === null) return false;
  for (let i = 0; i < 3; i++)
    if (a[i] !== b[i]) return /** @type {number} */ (a[i]) < /** @type {number} */ (b[i]);
  return false;
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
 * A Cloudflare API result. A 404 is null only where `missingOk` (a script that
 * was never deployed); anywhere else it fails, so a guard can't pass by not
 * finding what it checks.
 * @param {string} path
 * @param {{ missingOk?: boolean }} [opts]
 */
async function api(path, { missingOk = false } = {}) {
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = /** @type {{ success?: boolean, result?: any, errors?: unknown[] }} */ (
    await res.json().catch(() => ({}))
  );
  if (res.status === 404 && missingOk) return null;
  if (!res.ok || body.success === false) {
    throw new Error(`${path}: ${res.status} ${JSON.stringify(body.errors ?? [])}`);
  }
  return body.result;
}

function scriptPath(/** @type {string} */ script) {
  const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
  if (!account) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  return `/accounts/${account}/workers/scripts/${script}`;
}

/**
 * @typedef {{ name?: string, type?: string, text?: string }} Binding
 * @typedef {{ tag: string | null, bindings: Binding[] | null }} LiveVersion
 */

/**
 * The versions serving `script` now; empty before the first deploy.
 * @param {string} script
 * @returns {Promise<LiveVersion[]>}
 */
async function liveVersions(script) {
  const base = scriptPath(script);
  const deployments = await api(`${base}/deployments`, { missingOk: true });
  const latest = deployments?.deployments?.[0];
  if (!latest) return [];
  /** @type {LiveVersion[]} */
  const versions = [];
  for (const { version_id: id } of latest.versions ?? []) {
    const version = await api(`${base}/versions/${id}`);
    const tag = version?.annotations?.['workers/tag'];
    const bindings = version?.resources?.bindings;
    versions.push({
      tag: typeof tag === 'string' ? tag : null,
      bindings: Array.isArray(bindings) ? bindings : null,
    });
  }
  return versions;
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

/** @param {string[]} problems */
function fail(problems) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}

async function main() {
  const mode = process.argv[2];
  const config = await readDeployConfig();
  const script = config.name ?? 'hnch-relay';
  const version = packageVersion();

  if (mode === 'config') {
    const problems = configProblems(config);
    if (problems.length > 0) fail(problems);
    console.log(
      `config ok: ${script} ${version}, routes ${(config.routes ?? []).map((r) => (typeof r === 'string' ? r : r.pattern)).join(', ')}`,
    );
    return;
  }

  if (mode === 'live') {
    const problems = [];
    const configured = (config.routes ?? []).map((r) => (typeof r === 'string' ? r : r.pattern));
    const zones = new Set(
      (config.routes ?? []).flatMap((r) =>
        typeof r === 'string' || !r.zone_id ? [] : [r.zone_id],
      ),
    );
    for (const zone of zones) {
      const live = (await api(`/zones/${zone}/workers/routes`)) ?? [];
      const removed = removedRoutes(live, configured, script);
      if (removed.length > 0 && process.env['ALLOW_ROUTE_REMOVAL'] !== 'true') {
        problems.push(
          `deploy would remove live route(s) ${removed.join(', ')}; re-run with allow_route_removal if intended`,
        );
      } else if (removed.length > 0) {
        console.log(
          `::warning::removing live route(s) ${removed.join(', ')} (allow_route_removal)`,
        );
      }
    }
    // Secrets outlive deploys: one named like a test var would ride along.
    const secrets = new Set(
      /** @type {{ name?: string }[]} */ (
        (await api(`${scriptPath(script)}/secrets`, { missingOk: true })) ?? []
      ).flatMap((s) => (typeof s.name === 'string' ? [s.name] : [])),
    );
    for (const name of [...TEST_VARS, 'JURISDICTION']) {
      if (secrets.has(name)) problems.push(`secret ${name} is set on ${script}; delete it`);
    }
    const tags = (await liveVersions(script)).flatMap((v) => (v.tag === null ? [] : [v.tag]));
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
      (await api(`${scriptPath(script)}/secrets`)) ?? []
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

if (process.argv[1] === import.meta.filename) await main();
