// Tests for scripts/cloudflare/worker-guard.mjs, the helpers both deploy
// guards share (hnch-web here, hnch-relay in packages/relay). Run here
// because the repo root has no test lane.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  apiList,
  isDowngrade,
  liveRoutes,
  liveVersions,
  missingRoutes,
  parseVersion,
  routeRemovalProblems,
  scriptExists,
} from '../../../scripts/cloudflare/worker-guard.mjs';

const ZONE = '0d0f221371c8a419c6a9d36fc3b4da23';
const ROUTES = `https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes`;
const web = { routes: [{ pattern: 'hnch.dev/*', zone_id: ZONE }] };
const live = [
  { pattern: 'hnch.dev/health*', script: 'hnch-relay' },
  { pattern: 'hnch.dev/*', script: 'hnch-web' },
];

type Reply = { status?: number; body: unknown };
let replies: Map<string, Reply>;
let urls: string[];

/** Answers each URL with its reply; JSON-encodes bodies that aren't strings. */
function reply(url: string, body: unknown, status = 200) {
  replies.set(url, { status, body });
}

beforeEach(() => {
  replies = new Map();
  urls = [];
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token');
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acct');
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    const r = replies.get(url);
    if (r === undefined) return new Response('{}', { status: 500 });
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('api', () => {
  it('returns the result of an explicit success', async () => {
    reply(ROUTES, { success: true, result: live });
    expect(await api(`/zones/${ZONE}/workers/routes`)).toEqual(live);
  });

  it('rejects anything short of an explicit success', async () => {
    const path = `/zones/${ZONE}/workers/routes`;
    reply(ROUTES, { success: false, errors: [{ code: 10000 }], result: live }, 403);
    await expect(api(path)).rejects.toThrow('403');
    reply(ROUTES, { success: false, errors: [], result: live });
    await expect(api(path)).rejects.toThrow();
    reply(ROUTES, { result: live });
    await expect(api(path)).rejects.toThrow();
    reply(ROUTES, '<html>gateway</html>');
    await expect(api(path)).rejects.toThrow();
    reply(ROUTES, { success: true, result: null });
    await expect(api(path)).rejects.toThrow('/workers/routes');
  });

  it('rejects a 404: "never deployed" is asked of the script list instead', async () => {
    reply(ROUTES, { success: false, errors: [] }, 404);
    await expect(api(`/zones/${ZONE}/workers/routes`)).rejects.toThrow('404');
  });

  it('rejects a list endpoint that answers something else', async () => {
    reply(ROUTES, { success: true, result: { routes: live } });
    await expect(apiList(`/zones/${ZONE}/workers/routes`)).rejects.toThrow('expected a list');
  });
});

describe('liveRoutes and routeRemovalProblems', () => {
  it('reads the zone of the configured routes and passes a config that keeps them', async () => {
    reply(ROUTES, { success: true, result: live });
    expect(await routeRemovalProblems(web, 'hnch-web', false)).toEqual([]);
    expect(urls).toEqual([ROUTES]);
  });

  it('refuses to drop a live route unless removal is allowed', async () => {
    reply(ROUTES, { success: true, result: live });
    const moved = { routes: [{ pattern: 'hnch.dev/app/*', zone_id: ZONE }] };
    expect(await routeRemovalProblems(moved, 'hnch-web', false)).toEqual([
      expect.stringContaining('hnch.dev/*'),
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await routeRemovalProblems(moved, 'hnch-web', true)).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('::warning::'));
  });

  it('fails closed when the routes cannot be read', async () => {
    reply(ROUTES, { success: true, result: null });
    await expect(routeRemovalProblems(web, 'hnch-web', false)).rejects.toThrow();
    reply(ROUTES, 'not json');
    await expect(routeRemovalProblems(web, 'hnch-web', false)).rejects.toThrow();
    reply(ROUTES, { success: false, errors: [] }, 403);
    await expect(routeRemovalProblems(web, 'hnch-web', false)).rejects.toThrow();
  });

  it('refuses a config that names no zone', async () => {
    await expect(liveRoutes({ routes: [{ pattern: 'hnch.dev/*' }] })).rejects.toThrow('zone_id');
    await expect(liveRoutes({ routes: [] })).rejects.toThrow('zone_id');
    expect(urls).toEqual([]);
  });

  it('finds configured routes that are not live for this script', () => {
    expect(missingRoutes(live, ['hnch.dev/*'], 'hnch-web')).toEqual([]);
    expect(missingRoutes(live, ['hnch.dev/*'], 'hnch-relay')).toEqual(['hnch.dev/*']);
    expect(missingRoutes([], ['hnch.dev/*'], 'hnch-web')).toEqual(['hnch.dev/*']);
  });
});

describe('liveVersions', () => {
  const scripts = 'https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts';
  const base = `${scripts}/hnch-web`;

  it('is empty only for a script the account does not have', async () => {
    reply(scripts, { success: true, result: [{ id: 'hnch-relay' }] });
    expect(await scriptExists('hnch-web')).toBe(false);
    expect(await liveVersions('hnch-web')).toEqual([]);
    expect(urls).not.toContain(`${base}/deployments`);
  });

  it('fails when the script list is unreadable, rather than reading "never deployed"', async () => {
    reply(scripts, { success: false, errors: [] }, 404);
    await expect(liveVersions('hnch-web')).rejects.toThrow('/workers/scripts');
  });

  it('reads every version of the latest deployment', async () => {
    reply(scripts, { success: true, result: [{ id: 'hnch-web' }] });
    reply(`${base}/deployments`, {
      success: true,
      result: {
        deployments: [
          {
            versions: [
              { version_id: 'v1', percentage: 90 },
              { version_id: 'v2', percentage: 10 },
            ],
          },
        ],
      },
    });
    reply(`${base}/versions/v1`, {
      success: true,
      result: { annotations: { 'workers/tag': 'client-v1.0.0', 'workers/message': 'm1' } },
    });
    reply(`${base}/versions/v2`, { success: true, result: { annotations: {} } });
    expect(await liveVersions('hnch-web')).toEqual([
      { id: 'v1', percentage: 90, tag: 'client-v1.0.0', message: 'm1', bindings: null },
      { id: 'v2', percentage: 10, tag: null, message: null, bindings: null },
    ]);
  });

  it('fails closed on a deployed script whose deployments answer is malformed', async () => {
    reply(scripts, { success: true, result: [{ id: 'hnch-web' }] });
    reply(`${base}/deployments`, { success: true, result: {} });
    await expect(liveVersions('hnch-web')).rejects.toThrow('deployments');
    reply(`${base}/deployments`, { success: true, result: { deployments: [{}] } });
    await expect(liveVersions('hnch-web')).rejects.toThrow('versions');
    reply(`${base}/deployments`, { success: true, result: null });
    await expect(liveVersions('hnch-web')).rejects.toThrow('deployments');
    reply(`${base}/deployments`, { success: false, errors: [] }, 404);
    await expect(liveVersions('hnch-web')).rejects.toThrow('deployments');
  });
});

describe('versions', () => {
  it('reads release tags of the given prefix', () => {
    expect(parseVersion('client-v1.45.1', 'client-')).toEqual([1, 45, 1]);
    expect(parseVersion('relay-v1.45.1', 'client-')).toBeNull();
    expect(isDowngrade('1.45.0', 'client-v1.45.1', 'client-')).toBe(true);
  });
});
