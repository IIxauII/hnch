import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import {
  isDowngrade,
  missingRoutes,
  parseVersion,
  routeRemovalProblems,
} from '../../../scripts/cloudflare/worker-guard.mjs';
import { configProblems, HASHED, wwwProblems } from './deploy-guard.mjs';

const ZONE = '0d0f221371c8a419c6a9d36fc3b4da23';
const HEADERS = resolve(import.meta.dirname, '../src/_headers');
const prod = {
  name: 'hnch-web',
  routes: [{ pattern: 'hnch.dev/*', zone_id: ZONE }],
  workers_dev: false,
  preview_urls: false,
  assets: { directory: './www', not_found_handling: 'single-page-application' },
};

describe('configProblems', () => {
  it('passes the wrangler.jsonc in this package', () => {
    const config = unstable_readConfig({
      config: resolve(import.meta.dirname, '../wrangler.jsonc'),
    });
    expect(configProblems(config as never)).toEqual([]);
    expect(config.name).toBe('hnch-web');
  });

  it('refuses a Worker reachable outside hnch.dev', () => {
    expect(configProblems(prod)).toEqual([]);
    expect(configProblems({ ...prod, workers_dev: true })).toHaveLength(1);
    expect(configProblems({ ...prod, preview_urls: true })).toHaveLength(1);
  });

  it('refuses Worker code in front of the assets', () => {
    expect(configProblems({ ...prod, main: 'src/worker.ts' })).toHaveLength(1);
    expect(
      configProblems({ ...prod, assets: { ...prod.assets, run_worker_first: true } }),
    ).toHaveLength(1);
    expect(
      configProblems({ ...prod, assets: { ...prod.assets, run_worker_first: ['/*'] } }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, assets: { ...prod.assets, binding: 'ASSETS' } })).toHaveLength(
      1,
    );
  });

  it('refuses assets other than www with SPA fallback', () => {
    expect(
      configProblems({
        name: prod.name,
        routes: prod.routes,
        workers_dev: false,
        preview_urls: false,
      }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, assets: { ...prod.assets, directory: 'www/' } })).toEqual([]);
    expect(
      configProblems({ ...prod, assets: { ...prod.assets, directory: './dist' } }),
    ).toHaveLength(1);
    expect(
      configProblems({ ...prod, assets: { ...prod.assets, not_found_handling: '404-page' } }),
    ).toHaveLength(1);
  });

  it('refuses routes without zone_id, off hnch.dev, or none', () => {
    expect(
      configProblems({ ...prod, routes: [{ pattern: 'hnch.dev/*', zone_name: 'hnch.dev' }] }),
    ).toHaveLength(1);
    expect(
      configProblems({
        ...prod,
        routes: [{ pattern: 'hnch.dev', zone_id: ZONE, custom_domain: true }],
      }),
    ).toHaveLength(2);
    expect(
      configProblems({ ...prod, routes: [{ pattern: 'example.com/*', zone_id: ZONE }] }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, routes: [] })).toHaveLength(1);
  });
});

describe('wwwProblems', () => {
  let www: string;
  const put = (file: string, body = '') => {
    mkdirSync(dirname(join(www, file)), { recursive: true });
    writeFileSync(join(www, file), body);
  };

  beforeEach(() => {
    www = mkdtempSync(join(tmpdir(), 'hnch-www-'));
    put('index.html', '<app-root></app-root>');
    put('_headers', readFileSync(HEADERS, 'utf8'));
    put('main.66e4893120763c69.js');
    put('styles.876f054718d41689.css');
    put('219.b341d1532e91059a.js');
    put('3rdpartylicenses.txt');
    put('favicon.ico');
    put('assets/shapes.svg');
    put('svg/add.svg');
  });

  afterEach(() => rmSync(www, { recursive: true, force: true }));

  it('passes a production build', () => {
    expect(wwwProblems(www, HEADERS)).toEqual([]);
  });

  it('refuses an unhashed .js or .css anywhere in the build', () => {
    put('main.js');
    put('assets/vendor/lib.css');
    expect(wwwProblems(www, HEADERS)).toEqual([
      expect.stringContaining('assets/vendor/lib.css'),
      expect.stringContaining('main.js'),
    ]);
  });

  it('refuses a build without the _headers it was configured with', () => {
    rmSync(join(www, '_headers'));
    expect(wwwProblems(www, HEADERS)).toHaveLength(1);
    put('_headers', '/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    expect(wwwProblems(www, HEADERS)).toHaveLength(1);
  });

  it('refuses a directory that is not a build', () => {
    rmSync(join(www, 'index.html'));
    expect(wwwProblems(www, HEADERS)).toHaveLength(1);
  });

  it('matches the hash pattern of the Caddyfile', () => {
    expect(HASHED.test('main.66e4893120763c69.js')).toBe(true);
    expect(HASHED.test('chunk-ABCD2345.css')).toBe(false);
    expect(HASHED.test('chunk.ABCD2345.css')).toBe(true);
    expect(HASHED.test('polyfills.1234567.js')).toBe(false);
  });
});

describe('shared worker-guard helpers', () => {
  const live = [
    { pattern: 'hnch.dev/health*', script: 'hnch-relay' },
    { pattern: 'hnch.dev/*', script: 'hnch-web' },
  ];

  it('finds configured routes that are not live for this script', () => {
    expect(missingRoutes(live, ['hnch.dev/*'], 'hnch-web')).toEqual([]);
    expect(missingRoutes(live, ['hnch.dev/*'], 'hnch-relay')).toEqual(['hnch.dev/*']);
    expect(missingRoutes([], ['hnch.dev/*'], 'hnch-web')).toEqual(['hnch.dev/*']);
  });

  it('reads client release tags', () => {
    expect(parseVersion('client-v1.45.1', 'client-')).toEqual([1, 45, 1]);
    expect(parseVersion('relay-v1.45.1', 'client-')).toBeNull();
    expect(isDowngrade('1.45.0', 'client-v1.45.1', 'client-')).toBe(true);
  });

  describe('routeRemovalProblems', () => {
    const urls: string[] = [];

    beforeEach(() => {
      urls.length = 0;
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token');
      vi.stubGlobal('fetch', async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify({ success: true, result: live }));
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('reads the zone of the configured routes and passes a config that keeps them', async () => {
      expect(await routeRemovalProblems(prod, 'hnch-web', false)).toEqual([]);
      expect(urls).toEqual([`https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes`]);
    });

    it('refuses to drop a live route unless removal is allowed', async () => {
      const moved = { ...prod, routes: [{ pattern: 'hnch.dev/app/*', zone_id: ZONE }] };
      expect(await routeRemovalProblems(moved, 'hnch-web', false)).toEqual([
        expect.stringContaining('hnch.dev/*'),
      ]);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await routeRemovalProblems(moved, 'hnch-web', true)).toEqual([]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('::warning::'));
    });
  });
});
