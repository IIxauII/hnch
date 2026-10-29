import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import {
  configProblems,
  deployedVersionId,
  deployedVersionProblems,
  HASHED,
  wwwProblems,
} from './deploy-guard.mjs';

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

  it('refuses another Worker name', () => {
    expect(configProblems({ ...prod, name: 'hnch-relay' })).toHaveLength(1);
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
      configProblems({ ...prod, routes: [{ pattern: 'hnch.dev/*', zone_id: '' }] }),
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

  it("matches the webpack builder's .<hash>. form only", () => {
    expect(HASHED.test('main.66e4893120763c69.js')).toBe(true);
    expect(HASHED.test('chunk-ABCD2345.css')).toBe(false);
    expect(HASHED.test('chunk.ABCD2345.css')).toBe(true);
    expect(HASHED.test('polyfills.1234567.js')).toBe(false);
  });
});

describe('deployedVersionId', () => {
  it('takes the version id of the last deploy entry', () => {
    const out = [
      JSON.stringify({ type: 'wrangler-session', version: 1 }),
      JSON.stringify({ type: 'deploy', version: 1, version_id: 'aaaa' }),
      JSON.stringify({ type: 'deploy', version: 1, version_id: 'bbbb' }),
      '',
    ].join('\n');
    expect(deployedVersionId(out)).toBe('bbbb');
  });

  it('is null without a deploy entry', () => {
    expect(deployedVersionId('')).toBeNull();
    expect(deployedVersionId(JSON.stringify({ type: 'deploy', version_id: null }))).toBeNull();
  });
});

describe('deployedVersionProblems', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const version = {
    id: '11111111-2222-3333-4444-555555555555',
    percentage: 100,
    tag: 'client-v1.46.0',
    message: `client-v1.46.0 (${sha})`,
    bindings: [],
  };
  const expected = { versionId: version.id, sha, tag: 'client-v1.46.0' };

  it('passes when this upload serves all traffic with its commit and tag', () => {
    expect(deployedVersionProblems([version], expected)).toEqual([]);
    expect(
      deployedVersionProblems([{ ...version, tag: null, message: `untagged (${sha})` }], {
        ...expected,
        tag: '',
      }),
    ).toEqual([]);
  });

  it('refuses a script that was never deployed (no live versions)', () => {
    expect(deployedVersionProblems([], expected)).toEqual([expect.stringContaining('is not live')]);
  });

  it('refuses a reused tag whose live version is an earlier upload', () => {
    const earlier = { ...version, id: '99999999-2222-3333-4444-555555555555' };
    expect(deployedVersionProblems([earlier], expected)).toEqual([
      expect.stringContaining('is not live'),
    ]);
  });

  it('refuses a partial rollout, another commit, or the wrong tag', () => {
    expect(deployedVersionProblems([{ ...version, percentage: 50 }], expected)).toHaveLength(1);
    expect(
      deployedVersionProblems([{ ...version, message: 'client-v1.46.0 (deadbeef)' }], expected),
    ).toHaveLength(1);
    expect(deployedVersionProblems([version], { ...expected, tag: '' })).toHaveLength(1);
    expect(deployedVersionProblems([{ ...version, tag: null }], expected)).toHaveLength(1);
  });
});
